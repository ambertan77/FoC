// Code Reference:
// "AuthForge Client"
// GitHub: https://github.com/hamidukarimi/authforge-client
// Used for: Reference implementation for authentication-related and authorization-related client code.

import { useMutation } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { loginService } from "@/features/auth/services/auth.service";
import { setToken } from "@/utils/token";
import useAuthStore from "@/store/authStore";
import { parseError } from "@/utils/errorHandler";

import type { ParsedError } from "@/utils/errorHandler";
import type { AuthResult, LoginPayload } from "../types/auth.types";
import { toast } from "react-toastify";
import { ROUTES } from "@/routes/routes";
import { broadcastAuthEvent } from "@/utils/authSession";

const useLogin = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((state) => state.setUser);

  const { mutate, isPending, isError, error } = useMutation<
    AuthResult,
    ParsedError,
    LoginPayload
  >({
    mutationFn: async (payload: LoginPayload) => {
      try {
        const result = await loginService(payload);

        setToken(result.accessToken);
        setUser(result.user);
        broadcastAuthEvent("login");

        return result;
      } catch (rawError) {
        throw parseError(rawError);
      }
    },
    onSuccess: () => {
      const from = location.state?.from?.pathname || ROUTES.HOME;
      navigate(from, { replace: true });
      
      toast.success("Login successful!");
    },
    onError: (error) => {
      toast.error(error.message)
    },
  });

  return { login: mutate, isPending, isError, error };
};

export default useLogin;
