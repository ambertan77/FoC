import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CancelRequestPayload, Order } from "../types/order.types";
import type { ParsedError } from "@/utils/errorHandler";
import { cancelRequestService } from "../services/order.requester.service";
import { requesterOrderHistoryQueryKeys } from "./requesterOrderQueryKeys";
import { toast } from "react-toastify";
import { creditKeys } from "@/features/credit/hooks/credit.keys";
import { orderQueryKeys } from "./orderQueryKeys";

export function useCancelRequest() {
    const queryClient = useQueryClient();

    const { mutateAsync, isPending, isSuccess, isError } = useMutation<Order, ParsedError, CancelRequestPayload>({
        mutationFn: ({ orderId, expectedVersion, cancellationReason }) =>
            cancelRequestService(orderId, {
                expectedVersion,
                cancellationReason,
            }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: requesterOrderHistoryQueryKeys.all,
                }),
                queryClient.invalidateQueries({
                    queryKey: creditKeys.all,
                }),
                queryClient.invalidateQueries({
                    queryKey: orderQueryKeys.all,
                })
            ]);
            toast.success("Request canceled");
        },
        onError: error => {
            toast.error(error.message);
        },
    });

    return {
        cancelRequest: mutateAsync,
        isPending,
        isSuccess,
        isError,
    };
}
export default useCancelRequest;