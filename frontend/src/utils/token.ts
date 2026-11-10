// Code Reference:
// "AuthForge Client"
// GitHub: https://github.com/hamidukarimi/authforge-client
// Used for: Reference implementation for authentication-related and authorization-related client code.

const ACCESS_TOKEN_KEY = "access_token";

export const getToken = (): string | null => {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
};

export const setToken = (token: string): void => {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
};

export const removeToken = (): void => {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
};

export const hasToken = (): boolean => {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY) !== null;
};