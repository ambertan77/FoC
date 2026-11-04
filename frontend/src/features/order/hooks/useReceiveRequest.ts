import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Order, ReceiveRequestPayload } from "../types/order.types";
import type { ParsedError } from "@/utils/errorHandler";
import { receiveRequestService } from "../services/order.requester.service";
import { requesterOrderHistoryQueryKeys } from "./requesterOrderQueryKeys";
import { toast } from "react-toastify";
import { creditKeys } from "@/features/credit/hooks/credit.keys";
import { orderQueryKeys } from "./orderQueryKeys";

export function useReceiveRequest() {
    const queryClient = useQueryClient();

    const { mutateAsync, isPending, isSuccess, isError } = useMutation<Order, ParsedError, ReceiveRequestPayload>({
        mutationFn: ({ orderId, expectedVersion }) => receiveRequestService(orderId, expectedVersion),
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
            toast.success("Request marked as received");
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    return {
        receiveRequest: mutateAsync,
        isPending,
        isSuccess,
        isError,
    };
}

export default useReceiveRequest;