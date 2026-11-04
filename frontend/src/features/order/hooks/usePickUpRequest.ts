import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CourierUpdateStatusPayload, Order } from "../types/order.types";
import type { ParsedError } from "@/utils/errorHandler";
import { pickUpRequestService } from "../services/order.courier.service";
import { courierOrderQueryKeys } from "./courierOrderQueryKeys";
import { orderQueryKeys } from "./orderQueryKeys";
import { toast } from "react-toastify";

export function usePickUpRequest() {
    const queryClient = useQueryClient();

    const { mutateAsync, isPending, isSuccess, isError } = useMutation<Order, ParsedError, CourierUpdateStatusPayload>({
        mutationFn: ({orderId, expectedVersion}) => pickUpRequestService(orderId, { expectedVersion }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ 
                    queryKey: courierOrderQueryKeys.all 
                }),
                queryClient.invalidateQueries({ 
                    queryKey: orderQueryKeys.all 
                })
            ]);

            toast.success("Request picked up");
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    return {
        pickUpRequest: mutateAsync,
        isPending,
        isSuccess,
        isError,
    };
}

export default usePickUpRequest;