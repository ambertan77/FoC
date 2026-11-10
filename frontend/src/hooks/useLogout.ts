import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { logoutService } from "@/features/auth/services/auth.service";
import { removeToken } from "@/utils/token";
import useAuthStore from "@/store/authStore";
import queryClient from "@/lib/queryClient";
import type { ParsedError } from "@/utils/errorHandler";
import { ROUTES } from "@/routes/routes";
import { toast } from "react-toastify";
import { broadcastAuthEvent } from "@/utils/authSession";

const useLogout = () => {
    const navigate = useNavigate();
    const clearAuth = useAuthStore((state) => state.clearAuth);

    const { mutate, isPending } = useMutation<void, ParsedError>({
        mutationFn: async () => {
            await logoutService();
        },
        onSuccess: () => {
            removeToken();
            clearAuth();
            broadcastAuthEvent("logout");
            queryClient.clear();
            toast.success("Logged out successfully.");
            navigate(ROUTES.LOGIN);
        },
        onError: () => {
            removeToken();
            clearAuth();
            broadcastAuthEvent("logout");
            queryClient.clear();
            navigate(ROUTES.LOGIN);
        },
    });

    return { logout: mutate, isPending };
};

export default useLogout;