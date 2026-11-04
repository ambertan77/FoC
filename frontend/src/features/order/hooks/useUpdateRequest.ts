import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Order, UpdateRequestPayload } from "../types/order.types";
import type { ParsedError } from "@/utils/errorHandler";
import { updateRequestService } from "../services/order.requester.service";
import { toast } from "react-toastify";
import { requesterOrderHistoryQueryKeys } from "./requesterOrderQueryKeys";
import { orderQueryKeys } from "./orderQueryKeys";

export function useUpdateRequest() {
    const queryClient = useQueryClient();

    const { mutateAsync, isPending, isSuccess, isError } = useMutation<Order, ParsedError, UpdateRequestPayload>({
        mutationFn: ({ orderId, expectedVersion, payload }) => updateRequestService(orderId, { ...payload, expectedVersion }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: requesterOrderHistoryQueryKeys.all,
                }),
                queryClient.invalidateQueries({ 
                    queryKey: orderQueryKeys.all 
                })
            ]);
            
            toast.success("Request updated successfully");
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    return {
        updateRequest: mutateAsync,
        isPending,
        isSuccess,
        isError,
    };
}

export default useUpdateRequest;