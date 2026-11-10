// Code Reference:
// "AuthForge Client"
// GitHub: https://github.com/hamidukarimi/authforge-client
// Used for: Reference implementation for authentication-related and authorization-related client code.

import axios from "axios";
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from "axios";
import { getToken, setToken, removeToken } from "@/utils/token";
import { ENDPOINTS } from "@/api/endpoints";
import type { ApiResponse } from "@/types/api.types";
import type { AuthResult } from "@/features/auth/types/auth.types";
import useAuthStore from "@/store/authStore";

type RetryableRequestConfig = InternalAxiosRequestConfig & {
    _retry?: boolean;
    _sessionVersion?: number;
};

const BASE_AUTH_API_URL = import.meta.env.VITE_AUTH_API_BASE_URL;
if (!BASE_AUTH_API_URL) throw new Error("API_BASE_URL is not defined in env");

const refreshAccessToken = async (): Promise<string> => {
    const response = await axios.post<ApiResponse<AuthResult>>(
        `${BASE_AUTH_API_URL}${ENDPOINTS.auth.refreshToken}`,
        {},
        {
            withCredentials: true,
            headers: {
                "Content-Type": "application/json",
            },
        },
    );

    const newToken = response.data.data?.accessToken;

    if (!newToken) {
        throw new Error("No access token returned from refresh");
    }

    return newToken;
};


// All clients share one refresh for the current session and token. A new login
// must not join a previous session's pending refresh.
let pendingRefresh: {
    sessionVersion: number;
    token: string;
    promise: Promise<string>;
} | null = null;

const getRefreshedToken = (sessionVersion: number, token: string): Promise<string> => {
    if (pendingRefresh?.sessionVersion === sessionVersion && pendingRefresh.token === token) {
        return pendingRefresh.promise;
    }

    const isCurrentSession = () =>
        useAuthStore.getState().sessionVersion === sessionVersion && getToken() === token;

    const promise = refreshAccessToken()
        .then(newToken => {
            if (!isCurrentSession()) {
                throw new axios.CanceledError("Session changed during token refresh");
            }
            setToken(newToken);
            return newToken;
        })
        .catch(error => {
            // A late failure must not log out an account that signed in meanwhile.
            if (isCurrentSession()) {
                removeToken();
                window.dispatchEvent(new Event("auth:logout"));
            }
            throw error;
        })
        .finally(() => {
            if (pendingRefresh?.promise === promise) pendingRefresh = null;
        });

    pendingRefresh = { sessionVersion, token, promise };
    return promise;
};

const assertCurrentRequest = (config: RetryableRequestConfig): void => {
    if (config.signal?.aborted || (
        config._sessionVersion !== undefined
        && config._sessionVersion !== useAuthStore.getState().sessionVersion
    )) {
        throw new axios.CanceledError("Request canceled or session changed");
    }
};

// Create an Axios client for a particular microservice API, 
// with interceptors for handling token refresh and request retries.
const createApiClient = (baseURL: string): AxiosInstance => {
    if (!baseURL) throw new Error("API_BASE_URL is not defined in env");

    const api = axios.create({
        baseURL,
        withCredentials: true,
        headers: {
            "Content-Type": "application/json",
        },
    });

    // REQUEST INTERCEPTOR
    api.interceptors.request.use(
        (config: RetryableRequestConfig) => {
            assertCurrentRequest(config);
            config._sessionVersion = useAuthStore.getState().sessionVersion;
            const token = getToken();
            if (token && config.headers) {
                config.headers.Authorization = `Bearer ${token}`;
            } else {
                config.headers.delete("Authorization");
            }
            return config;
        },
        (error: unknown) => Promise.reject(error)
    );


    // RESPONSE INTERCEPTOR
    api.interceptors.response.use(
        (response: AxiosResponse) => response,
        async (error: unknown) => {
            if (!axios.isAxiosError(error) || !error.config) {
                return Promise.reject(error);
            }

            const originalRequest = error.config as RetryableRequestConfig;
            assertCurrentRequest(originalRequest);

            const status = error.response?.status;
            const requestUrl = originalRequest.url ?? "";

            // Skip token refresh for auth endpoints to avoid infinite loops
            const isAuthEndpoint =
                requestUrl.includes(ENDPOINTS.auth.login) ||
                requestUrl.includes(ENDPOINTS.auth.refreshToken) ||
                requestUrl.includes(ENDPOINTS.auth.logout) ||
                requestUrl.includes(ENDPOINTS.auth.adminActivation) ||
                requestUrl.includes(ENDPOINTS.auth.register);

            const isPasswordChangeEndpoint =
                requestUrl.includes(ENDPOINTS.user.passwordChange);

            if (isAuthEndpoint || isPasswordChangeEndpoint) {
                return Promise.reject(error);
            }

            // Only refresh access token for 401 Unauthorized errors and if the request hasn't been retried yet
            if (status !== 401 || originalRequest._retry) {
                return Promise.reject(error);
            }

            const token = getToken();
            if (!token) return Promise.reject(error);

            // Mark every request before waiting, including concurrent requests,
            // so a second 401 never starts another refresh for the same request.
            originalRequest._retry = true;

            // Another request may already have refreshed this session's token
            // before this 401 arrived. Retry with that token instead.
            if (originalRequest.headers.Authorization === `Bearer ${token}`) {
                await getRefreshedToken(useAuthStore.getState().sessionVersion, token);
            }

            assertCurrentRequest(originalRequest);
            return api(originalRequest);
        }
    );

    return api;
}

export default createApiClient;
