import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseError, type ParsedError } from "@/utils/errorHandler";
import { toast } from "react-toastify";
import type { CreateRequestPayload, Order } from "@/features/order/types/order.types";
import { createRequestService } from "@/features/order/services/order.requester.service";
import { creditKeys } from "@/features/credit/hooks/credit.keys";
import { requesterOrderHistoryQueryKeys } from "./requesterOrderQueryKeys";
import { orderQueryKeys } from "./orderQueryKeys";

const useCreateRequest = () => {
    const queryClient = useQueryClient();

    const { mutate, isPending, isError, error } = useMutation<
        Order,
        ParsedError,
        CreateRequestPayload
    >({
        mutationFn: async (payload: CreateRequestPayload) => {
            try {
                const result = await createRequestService(payload);

                return result;
            } catch (rawError) {
                throw parseError(rawError);
            }
        },
        onSuccess: async (order) => {
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: requesterOrderHistoryQueryKeys.all,
                }),
                queryClient.invalidateQueries({
                    queryKey: creditKeys.balance(order.requesterId),
                }),
                queryClient.invalidateQueries({
                    queryKey: creditKeys.transactions(order.requesterId),
                }),
                queryClient.invalidateQueries({
                    queryKey: orderQueryKeys.all,
                }),
            ]);
            toast.success(`
                Request submitted and listed under Requester Activity. 
                Please wait for the credit reservation approval.
            `);
        },
        onError: (error) => {
            toast.error(error.message)
        },
    });

    return { createRequest: mutate, isPending, isError, error };
};

export default useCreateRequest;