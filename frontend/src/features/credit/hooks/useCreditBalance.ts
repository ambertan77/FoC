// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated the balance query hook that polls every 2s while provisioning and gives up after a 30s deadline.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ROLES } from "@/features/auth/types/auth.types";
import useAuth from "@/hooks/useAuth";
import { parseError, type ParsedError } from "@/utils/errorHandler";
import { creditKeys } from "./credit.keys";
import { getCreditBalanceService } from "../services/credit.service";
import type { CreditBalance } from "../types/credit.types";

const READY_REFRESH_MS = 30_000;
const PROVISIONING_POLL_MS = 2_000;
const PROVISIONING_TIMEOUT_MS = 30_000;

export type CreditBalanceState =
    | { status: "hidden" }
    | { status: "loading" }
    | { status: "provisioning" }
    | { status: "delayed" }
    | { status: "unavailable"; error: ParsedError }
    | { status: "ready"; balance: Extract<CreditBalance, { status: "READY" }> };

// Client-only polling metadata shares the balance's cache and logout lifecycle.
type CreditBalanceQueryData = CreditBalance & {
    provisioningDeadline: number | null;
    setupDelayed: boolean;
};

const useCreditBalance = () => {
    const { user, isAuthenticated, isInitializing } = useAuth();
    const queryClient = useQueryClient();
    const userId = user?.id ?? "";
    const isEligible = !isInitializing && isAuthenticated
        && user?.role === ROLES.STUDENT && !!userId;
    const queryKey = creditKeys.balance(userId);

    const query = useQuery<CreditBalanceQueryData, ParsedError>({
        queryKey,
        enabled: current => isEligible
            && (current.state.status === "error" || !current.state.data?.setupDelayed),
        queryFn: async ({ signal }) => {
            const previous = queryClient.getQueryState<CreditBalanceQueryData>(queryKey);
            const deadline = previous?.status === "error"
                ? null : previous?.data?.provisioningDeadline ?? null;

            // Hidden tabs may delay timers; don't issue another request past the deadline.
            if (previous?.data && deadline !== null && Date.now() >= deadline) {
                return { ...previous.data, setupDelayed: true };
            }

            try {
                const balance = await getCreditBalanceService(signal);
                const provisioningDeadline = balance.status === "PROVISIONING"
                    ? deadline ?? Date.now() + PROVISIONING_TIMEOUT_MS : null;
                return {
                    ...balance,
                    provisioningDeadline,
                    setupDelayed: provisioningDeadline !== null && Date.now() >= provisioningDeadline,
                };
            } catch (error) {
                throw parseError(error);
            }
        },
        staleTime: READY_REFRESH_MS,
        retry: false,
        refetchOnWindowFocus: "always",
        refetchOnReconnect: "always",
        refetchIntervalInBackground: false,
        refetchInterval: current => {
            if (current.state.status === "error" || current.state.data?.setupDelayed) return false;
            if (current.state.data?.status === "READY") return READY_REFRESH_MS;
            if (current.state.data?.status === "PROVISIONING") return PROVISIONING_POLL_MS;
            return false;
        },
    });

    const deadline = query.data?.provisioningDeadline;
    useEffect(() => {
        if (!isEligible || query.isError || deadline == null) return;
        const key = creditKeys.balance(userId);
        const timer = setTimeout(() => {
            if (queryClient.getQueryState(key)?.status === "error") return;
            queryClient.setQueryData<CreditBalanceQueryData>(key, current =>
                current?.provisioningDeadline === deadline
                    ? { ...current, setupDelayed: true } : current,
            );
        }, Math.max(0, deadline - Date.now()));
        return () => clearTimeout(timer);
    }, [isEligible, userId, deadline, query.isError, queryClient]);

    const retry = async (): Promise<void> => {
        if (!isEligible || query.fetchStatus !== "idle") return;
        // Reset cached provisioning metadata and let the active query fetch again.
        await queryClient.resetQueries({ queryKey, exact: true });
    };

    // Derive the display union from Query's result
    let state: CreditBalanceState;
    if (!isEligible) state = { status: "hidden" };
    else if (query.isError) state = { status: "unavailable", error: query.error };
    else if (query.data?.status === "READY") state = { status: "ready", balance: query.data };
    else if (query.data?.status === "PROVISIONING") {
        state = { status: query.data.setupDelayed ? "delayed" : "provisioning" };
    } else state = { status: "loading" };

    return {
        ...query,
        state,
        isEligible,
        isSetupDelayed: !query.isError && (query.data?.setupDelayed ?? false),
        retry,
    };
};

export default useCreditBalance;
