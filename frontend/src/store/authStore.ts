// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Helped fix stale credit data by clearing credit queries (removeQueries on creditKeys.all) when the session user changes or auth is cleared.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import type { ApiUser } from "@/features/auth/types/auth.types";
import { creditKeys } from "@/features/credit/hooks/credit.keys";
import queryClient from "@/lib/queryClient";
import { create } from "zustand";

interface AuthState {
    user: ApiUser | null;
    isAuthenticated: boolean;
    sessionVersion: number;

    setUser: (user: ApiUser) => void;
    clearAuth: () => void;
}

const clearCreditQueries = () => {
    void queryClient.cancelQueries({ queryKey: creditKeys.all });
    queryClient.removeQueries({ queryKey: creditKeys.all });
};

const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    isAuthenticated: false,
    sessionVersion: 0,

    setUser: (user: ApiUser) => {
        const current = get();
        const sessionChanged = !current.isAuthenticated
            || current.user?.id !== user.id
            || current.user?.role !== user.role;

        if (sessionChanged) clearCreditQueries();
        set({
            user,
            isAuthenticated: true,
            sessionVersion: current.sessionVersion + (sessionChanged ? 1 : 0),
        });
    },
    clearAuth: () => {
        clearCreditQueries();
        set(state => ({
            user: null,
            isAuthenticated: false,
            sessionVersion: state.sessionVersion + 1,
        }));
    },
}));

export default useAuthStore;
