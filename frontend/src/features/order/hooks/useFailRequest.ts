import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FailRequestPayload, Order } from "../types/order.types";
import type { ParsedError } from "@/utils/errorHandler";
import { failedRequestService } from "../services/order.requester.service";
import { requesterOrderHistoryQueryKeys } from "./requesterOrderQueryKeys";
import { toast } from "react-toastify";
import { creditKeys } from "@/features/credit/hooks/credit.keys";
import { orderQueryKeys } from "./orderQueryKeys";

export function useFailRequest() {
    const queryClient = useQueryClient();

    const { mutateAsync, isPending, isSuccess, isError } = useMutation<Order, ParsedError, FailRequestPayload>({
        mutationFn: ({ orderId, expectedVersion, failureReason }) => failedRequestService(orderId, { expectedVersion, failureReason }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: requesterOrderHistoryQueryKeys.all,
                }),
                queryClient.invalidateQueries({
                    queryKey: creditKeys.all,
                }),
                queryClient.invalidateQueries({
                    queryKey: orderQueryKeys.all
                })
            ]);

            toast.success("Request marked as failed");
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    return {
        failRequest: mutateAsync,
        isPending,
        isSuccess,
        isError,
    };
}

export default useFailRequest;