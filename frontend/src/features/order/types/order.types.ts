import type { ButtonProps } from "@/components/ui/button";
import type { CreateRequestFormData } from "../schemas/create-request.schema";
import type { RenewRequestFormData } from "../schemas/renew-request.schema";
import type { SupplierStatus } from "@/features/supplier/types/supplier.types";

export const statusVariant: Record<OrderStatus, ButtonProps["variant"]> = {
    OPEN: "teal",
    ACCEPTED: "sky",
    PICKED_UP: "yellow",
    COMPLETED: "indigo200",
    RECEIVED: "green",
    CANCELED: "gray",
    FAILED: "red",
    EXPIRED: "orange",
    PENDING_RESERVATION: "cyan",
    RESERVATION_FAILED: "pink",
    AUTO_RECEIVED: "darkGreen",
    AUTO_FAILED: "darkRed"
};

export const ORDER_STATUSES = [
    "OPEN",
    "ACCEPTED",
    "PICKED_UP",
    "COMPLETED",
    "RECEIVED",
    "CANCELED",
    "FAILED",
    "EXPIRED",
    "PENDING_RESERVATION",
    "RESERVATION_FAILED",
    "AUTO_RECEIVED",
    "AUTO_FAILED"
] as const;

export const COURIER_ORDER_STATUSES = [
    "ACCEPTED",
    "PICKED_UP",
    "COMPLETED",
    "RECEIVED",
    "FAILED",
    "AUTO_RECEIVED",
    "AUTO_FAILED"
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_CATEGORIES = [
    "ALL",
    "LIVE",
    "PAST"
] as const;

export type OrderStatusCategory = (typeof ORDER_STATUS_CATEGORIES)[number];

export const STATUS_CATEGORY_MAPPING: Record<OrderStatusCategory, readonly OrderStatus[]> = {
    ALL: ORDER_STATUSES,
    LIVE: ["OPEN", "ACCEPTED", "PENDING_RESERVATION", "PICKED_UP", "COMPLETED"],
    PAST: ["RECEIVED", "CANCELED", "FAILED", "EXPIRED", "RESERVATION_FAILED", "AUTO_RECEIVED", "AUTO_FAILED"],
};

export const REORDERABLE_STATUSES = new Set<OrderStatus>([
    "RECEIVED",
    "CANCELED",
    "FAILED",
    "EXPIRED",
    "RESERVATION_FAILED",
    "AUTO_RECEIVED",
    "AUTO_FAILED"
]);

export interface Order {
    id: string;
    requesterId: string;
    courierId: string | null;

    name: string;
    description: string;
    pickupSupplierId: string;
    deliverySupplierId: string;

    offeredCredits: number;
    status: OrderStatus;
    remarks: string | null;

    version: number;

    expiryAt: string;
    createdAt: string;
    updatedAt: string;

    acceptedAt: string | null;
    pickedUpAt: string | null;
    completedAt: string | null;
    receivedAt: string | null;
    cancelledAt: string | null;
    expiredAt: string | null;
    failedAt: string | null;

    cancellationReason: string | null;
    failureReason: string | null;

    reservationFailureCode: string | null;

    renewalPending: boolean;
    renewalFailureCode: string | null;
}

export type OrderHistoryParams = {
    page: number;
    statuses?: readonly OrderStatus[];
    sortBy: SortBy;
    sortOrder: SortOrder;
    filterLocation?: string; // the string passed in here should be the supplierId
    searchString?: string;
    startDate?: string; // date object converted to YYYY-MM-DD format
    endDate?: string; // date object converted to YYYY-MM-DD format
}; // params for admins viewing (live and past) order dashboard

export type OrderHistoryResponse = {
    orders: Order[];
    pagination: {
        limit: number;
        page: number;
        totalCount: number;
        totalPages: number;
    };
}; // response structure for querying admin's (live and past) order dashboard

export type RequesterOrderHistoryParams = {
    page: number;
    limit: number;
    status?: OrderStatus;
    sortBy: SortBy;
    sortOrder: SortOrder;
};

export type RequesterOrderHistoryResponse = {
    orders: Order[];
    pagination: {
        limit: number;
        page: number;
        totalCount: number;
        totalPages: number;
    };
};

export type OpenOrdersQueryParams = {
    page: number;
    limit: number;
    sortBy: SortBy;
    sortOrder: SortOrder;
    filterLocation?: string; // the string passed in here should be the supplierId
    searchString?: string;
};

export type OpenOrdersQueryResponse = {
    orders: Order[];
    pagination: {
        limit: number;
        page: number;
        totalCount: number;
        totalPages: number;
    };
};

export type CourierOrderHistoryParams = {
    page: number;
    limit: number;
    status?: OrderStatus;
    sortBy: SortBy;
    sortOrder: SortOrder;
};

export type CourierOrderHistoryResponse = {
    orders: Order[];
    pagination: {
        limit: number;
        page: number;
        totalCount: number;
        totalPages: number;
    };
};

export type OrderRelatedUserDetails = {
    userId: string;
    username: string;
    email: string;
    phoneNumber: string;
};

export type OrderRelatedSupplierDetails = {
    id: string;
    name: string;
    type: string;
    status: SupplierStatus;
};

export type ViewerRole = "requester" | "courier" | "admin";

export type SortBy = "createdAt" | "expiryAt" | "acceptedAt" | "offeredCredits";

export type SortOrder = "asc" | "desc";

export type UpdateRequestPayload = {
    orderId: string;
    expectedVersion: number;
    payload: CreateRequestFormData;
}

export interface CreateRequestPayload {
    name: string;
    description: string;
    pickupSupplierId: string;
    deliverySupplierId: string;
    offeredCredits: number;
    expiryAt: string;
    remarks: string;
}

export type ReceiveRequestPayload = {
    orderId: string;
    expectedVersion: number;
}

export type FailRequestPayload = {
    orderId: string;
    expectedVersion: number;
    failureReason: string;
}

export type CancelRequestPayload = {
    orderId: string;
    expectedVersion: number;
    cancellationReason?: string;
}

export type RenewRequestPayload = {
    orderId: string;
    payload: RenewRequestFormData;
}

export type CourierUpdateStatusPayload = {
    orderId: string;
    expectedVersion: number;
}

export type ReorderFormInput = {
    name: string;
    description: string;
    pickupSupplierId: string;
    deliverySupplierId: string;
    offeredCredits: string;
    expiryAt: string;
    remarks: string;
    isSuppliersLoading: boolean;
    pickupSupplierName: string;
    deliverySupplierName: string;
};