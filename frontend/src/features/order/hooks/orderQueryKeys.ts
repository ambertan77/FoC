import type { OrderHistoryParams } from "@/features/order/types/order.types";

export const orderQueryKeys = {
    all: ["allOrders"] as const,
    history: (params: OrderHistoryParams) =>
        [...orderQueryKeys.all, "history", params] as const,
};
