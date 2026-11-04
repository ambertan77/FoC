import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Order } from "../types/order.types";
import type { ParsedError } from "@/utils/errorHandler";
import { completeRequestService } from "../services/order.courier.service";
import { courierOrderQueryKeys } from "./courierOrderQueryKeys";
import { orderQueryKeys } from "./orderQueryKeys";
import { toast } from "react-toastify";

export function useCompleteRequest() {
    const queryClient = useQueryClient();

    const { mutateAsync, isPending, isSuccess, isError } = useMutation<Order, ParsedError, string>({
        mutationFn: (orderId) => completeRequestService(orderId),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ 
                    queryKey: courierOrderQueryKeys.all 
                }),
                queryClient.invalidateQueries({ 
                    queryKey: orderQueryKeys.all 
                })
            ]);

            toast.success("Request completed");
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    return {
        completeRequest: mutateAsync,
        isPending,
        isSuccess,
        isError,
    };
}

export default useCompleteRequest;