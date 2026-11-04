import { useQuery } from "@tanstack/react-query";
import type { OrderHistoryParams, OrderHistoryResponse } from "@/features/order/types/order.types";
import { getOrderHistoryService } from "@/features/order/services/order.service";
import { orderQueryKeys } from "@/features/order/hooks/orderQueryKeys";
import type { ParsedError } from "@/utils/errorHandler";

export const useOrderHistory = (
    params: OrderHistoryParams
) => {
    return useQuery<OrderHistoryResponse, ParsedError>({
        queryKey: orderQueryKeys.history(params),
        queryFn: () => getOrderHistoryService(params),
        placeholderData: (previousData) => previousData,
        staleTime: 0, // every change in status filter will fetch new data 
        refetchInterval: 10_000, // Refetch every 10 seconds
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
    });
};
