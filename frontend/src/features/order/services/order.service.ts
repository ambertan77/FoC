import { ENDPOINTS } from "@/api/endpoints";
import type { OrderHistoryParams, OrderHistoryResponse } from "../types/order.types";
import { parseError } from "@/utils/errorHandler";
import type { ApiResponse } from "@/types/api.types";
import orderApi from "@/api/orderApi";

export const getOrderHistoryService = async (
    params: OrderHistoryParams,
): Promise<OrderHistoryResponse> => {
    try {
        const queryParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams.set(key, String(value));
            }
        });

        const response = await orderApi.get<ApiResponse<OrderHistoryResponse>>(
            `${ENDPOINTS.order.getAllOrders}?${queryParams.toString()}`
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};