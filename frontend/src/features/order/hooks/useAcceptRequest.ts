import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Order } from "../types/order.types";
import type { ParsedError } from "@/utils/errorHandler";
import { acceptRequestService } from "../services/order.courier.service";
import { courierOrderQueryKeys } from "./courierOrderQueryKeys";
import { orderQueryKeys } from "./orderQueryKeys";
import { toast } from "react-toastify";

export function useAcceptRequest() {
    const queryClient = useQueryClient();

    const { mutateAsync, isPending, isSuccess, isError } = useMutation<Order, ParsedError, string>({
        mutationFn: (orderId) => acceptRequestService(orderId),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ 
                    queryKey: courierOrderQueryKeys.all 
                }),
                queryClient.invalidateQueries({ 
                    queryKey: orderQueryKeys.all 
                })
            ]);
            
            toast.success("Request accepted and listed under Courier Activity");
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    return {
        acceptRequest: mutateAsync,
        isPending,
        isSuccess,
        isError,
    };
}

export default useAcceptRequest;