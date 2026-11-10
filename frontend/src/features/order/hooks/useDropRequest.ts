// AI Assistance Disclosure:
// Tool: Claude Code (Opus 5.5)
// Date: 2026-11-04
// Scope: Fix compilation time errors in the payload of the mutationFn
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CourierUpdateStatusPayload, Order } from "../types/order.types";
import type { ParsedError } from "@/utils/errorHandler";
import { dropRequestService } from "../services/order.courier.service";
import { courierOrderQueryKeys } from "./courierOrderQueryKeys";
import { orderQueryKeys } from "./orderQueryKeys";
import { toast } from "react-toastify";

export function useDropRequest() {
    const queryClient = useQueryClient();

    const { mutateAsync, isPending, isSuccess, isError } = useMutation<Order, ParsedError, CourierUpdateStatusPayload>({
        mutationFn: ({ orderId, expectedVersion }) => dropRequestService(orderId, { expectedVersion }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ 
                    queryKey: courierOrderQueryKeys.all 
                }),
                queryClient.invalidateQueries({ 
                    queryKey: orderQueryKeys.all 
                })
            ]);

            toast.success("Request dropped");
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    return {
        dropRequest: mutateAsync,
        isPending,
        isSuccess,
        isError,
    };
}

export default useDropRequest;