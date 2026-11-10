import { useContext } from "react";
import useAuthStore from "@/store/authStore";
import { AuthContext } from "@/context/AuthContext";

const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }

    const user = useAuthStore((state) => state.user);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const sessionVersion = useAuthStore((state) => state.sessionVersion);
    const { isInitializing, restoreSession } = context;

    return {
        user,
        isAuthenticated,
        sessionVersion,
        isInitializing,
        restoreSession,
    };
};

export default useAuth;