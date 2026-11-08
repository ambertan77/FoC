// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated the useInfiniteQuery hook for cursor-paginated transactions with type and sort filters.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { useQuery } from "@tanstack/react-query";
import { ROLES } from "@/features/auth/types/auth.types";
import useAuth from "@/hooks/useAuth";
import { parseError, type ParsedError } from "@/utils/errorHandler";
import { creditKeys } from "./credit.keys";
import { getCreditTransactionsService } from "../services/credit.service";
import type { CreditTransactionParams, CreditTransactions } from "../types/credit.types";

const useCreditTransactions = (params: CreditTransactionParams) => {
    const { user, isAuthenticated, isInitializing } = useAuth();
    const isEligible = !isInitializing && isAuthenticated
        && user?.role === ROLES.STUDENT && !!user.id;

    const query = useQuery<CreditTransactions, ParsedError>({
        queryKey: creditKeys.transactionPage(user?.id ?? "", params),
        enabled: isEligible,
        queryFn: async ({ signal }) => {
            try {
                return await getCreditTransactionsService(params, signal);
            } catch (error) {
                throw parseError(error);
            }
        },
        staleTime: 30_000,
        retry: false,
        // History is a live cursor view. Refresh explicitly to return to its start.
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const retry = async () => {
        if (isEligible && query.fetchStatus === "idle") await query.refetch();
    };

    return { ...query, isEligible, retry };
};

export default useCreditTransactions;
