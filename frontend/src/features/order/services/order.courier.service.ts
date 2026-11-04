import { ENDPOINTS } from "@/api/endpoints";
import type { 
    CourierOrderHistoryParams, 
    CourierOrderHistoryResponse, 
    OpenOrdersQueryParams, 
    OpenOrdersQueryResponse,
    Order
} from "../types/order.types";
import { parseError } from "@/utils/errorHandler";
import type { ApiResponse } from "@/types/api.types";
import orderApi from "@/api/orderApi";

export const getOpenRequestsService = async (
    params: OpenOrdersQueryParams,
): Promise<OpenOrdersQueryResponse> => {
    try {
        const queryParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams.set(key, String(value));
            }
        });

        const response = await orderApi.get<ApiResponse<OpenOrdersQueryResponse>>(
            `${ENDPOINTS.order.getOpenOrders}?${queryParams.toString()}`
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const acceptRequestService = async (
    orderId: string,
    payload: { expectedVersion: number }
): Promise<Order> => {
    try {
        const response = await orderApi.post<ApiResponse<Order>>(
            `${ENDPOINTS.order.acceptOrder}`.replace(":orderId", orderId),
            payload
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
}

export const pickUpRequestService = async (
    orderId: string,
    payload: { expectedVersion: number }
): Promise<Order> => {
    try {
        const response = await orderApi.post<ApiResponse<Order>>(
            `${ENDPOINTS.order.pickUpOrder}`.replace(":orderId", orderId),
            payload
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
}

export const completeRequestService = async (
    orderId: string,
    payload: { expectedVersion: number }
): Promise<Order> => {
    try {
        const response = await orderApi.post<ApiResponse<Order>>(
            `${ENDPOINTS.order.completeOrder}`.replace(":orderId", orderId),
            payload
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
}

export const dropRequestService = async (
    orderId: string,
    payload: { expectedVersion: number }
): Promise<Order> => {
    try {
        const response = await orderApi.delete<ApiResponse<Order>>(
            `${ENDPOINTS.order.dropOrder}`.replace(":orderId", orderId),
            { data: payload }
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
}

export const getCourierOrderHistoryService = async (
    params: CourierOrderHistoryParams,
): Promise<CourierOrderHistoryResponse> => {
    try {
        const queryParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams.set(key, String(value));
            }
        });

        const response = await orderApi.get<ApiResponse<CourierOrderHistoryResponse>>(
            `${ENDPOINTS.order.getCourierOrderHistory}?${queryParams.toString()}`
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};