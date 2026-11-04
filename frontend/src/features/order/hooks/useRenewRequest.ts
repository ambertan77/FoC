import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { ParsedError } from "@/utils/errorHandler";
import type { Order, RenewRequestPayload } from "../types/order.types";
import { requesterOrderHistoryQueryKeys } from "./requesterOrderQueryKeys";
import { creditKeys } from "@/features/credit/hooks/credit.keys";
import { renewRequestService } from "../services/order.requester.service";
import { orderQueryKeys } from "./orderQueryKeys";

export function useRenewRequest() {
    const queryClient = useQueryClient();

    const { mutateAsync, isPending, isError, error } = useMutation<
        Order, ParsedError, RenewRequestPayload
    >({
        mutationFn: ({ orderId, payload }) =>
            renewRequestService(orderId, payload),
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

            toast.success("Renewal request submitted. Please wait for the credit reservation approval.");
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    return {
        renewRequest: mutateAsync,
        isPending,
        isError,
        error,
    };
}