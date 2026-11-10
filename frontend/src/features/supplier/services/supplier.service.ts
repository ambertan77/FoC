// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Client requests for creating, updating, deactivating and activating suppliers.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import axios from "axios";
import { ENDPOINTS } from "@/api/endpoints";
import { getToken } from "@/utils/token";
import type { ApiResponse } from "@/types/api.types";
import type { 
    CreateSupplierInput,
    Supplier, 
    SuppliersQueryParams,
    SuppliersQueryResponse,
    SupplierType, 
    SupplierTypeCount,
    UpdateSupplierInput, 
} from "../types/supplier.types";
import { parseError } from "@/utils/errorHandler";
import type { OrderRelatedSupplierDetails } from "@/features/order/types/order.types";
import supplierApi from "@/api/supplierApi";

export const getAllSuppliers = async (
    params: SuppliersQueryParams,
): Promise<SuppliersQueryResponse> => {
    try {
        const queryParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams.set(key, String(value));
            }
        });

        const response = await supplierApi.get<ApiResponse<SuppliersQueryResponse>>(
            `${ENDPOINTS.supplier.getAllSuppliers}?${queryParams.toString()}`
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const getActiveSuppliers = async (
    params: SuppliersQueryParams,
): Promise<SuppliersQueryResponse> => {
    try {
        const queryParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined) {
                queryParams.set(key, String(value));
            }
        });

        const response = await supplierApi.get<ApiResponse<SuppliersQueryResponse>>(
            `${ENDPOINTS.supplier.getActiveSuppliers}?${queryParams.toString()}`
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const getSuppliersByIdsService = async (
    ids: string[],
): Promise<OrderRelatedSupplierDetails[]> => {
    try {
        const response = await supplierApi.get<ApiResponse<OrderRelatedSupplierDetails[]>>(
            ENDPOINTS.supplier.getSuppliersByIds(ids),
        );

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const createSupplier = async (input: CreateSupplierInput): Promise<Supplier> => {
    try {
        const response = await supplierApi.post<ApiResponse<Supplier>>(
            ENDPOINTS.supplier.createSupplier,
            input,
        );
        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const updateSupplier = async (id: string, input: UpdateSupplierInput): Promise<Supplier> => {
    try {
        const url = ENDPOINTS.supplier.updateSupplier.replace(":supplierId", id);
        const response = await supplierApi.patch<ApiResponse<Supplier>>(url, input);
        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const activateSupplier = async (id: string): Promise<Supplier> => {
    try {
        const url = ENDPOINTS.supplier.activateSupplier.replace(":supplierId", id);
        const response = await supplierApi.patch<ApiResponse<Supplier>>(url);
        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export const deactivateSupplier = async (id: string): Promise<Supplier> => {
    try {
        const url = ENDPOINTS.supplier.deactivateSupplier.replace(":supplierId", id);
        const response = await supplierApi.patch<ApiResponse<Supplier>>(url);
        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};


export const getAllSupplierTypes = async (): Promise<SupplierType[]> => {
    try {
        const response = await supplierApi.get<ApiResponse<SupplierType[]>>(
            `${ENDPOINTS.supplier.getAllSupplierTypes}`,
        );

        return response.data.data ?? [];
    } catch (error) {
        throw parseError(error);
    }
};

export const countsForEachSupplierType = async (): Promise<SupplierTypeCount[]> => {
    try {
        const response = await supplierApi.get<ApiResponse<SupplierTypeCount[]>>(
            `${ENDPOINTS.supplier.countsForEachSupplierType}`
        );

        return response.data.data ?? [];
    } catch (error) {
        throw parseError(error);
    }
};

export const createSupplierType = async (type: string): Promise<SupplierType> => {
    const jsonBody = {
        type: type,
    }
    try {
        const response = await supplierApi.post<ApiResponse<SupplierType>>(
            `${ENDPOINTS.supplier.createSupplierType}`,
            jsonBody
        );

        return response.data.data!; // will always return the newly created supplier type
    } catch (error) {
        throw parseError(error);
    }
};

export const deleteSupplierType = async (type: SupplierType): Promise<SupplierType> => {
    try {
        const response = await supplierApi.delete<ApiResponse<SupplierType>>(
            `${ENDPOINTS.supplier.deleteSupplierType}`.replace(":typeId", type.id),
        );

        return response.data.data!; // will always return the deleted supplier type
    } catch (error) {
        throw parseError(error);
    }
};

export const uploadSupplierImage = async (file: File): Promise<string> => {
    try {
        const formData = new FormData();
        formData.append("image", file);
        const token = getToken();
        const response = await axios.post<ApiResponse<{ imageUrl: string }>>(
            `${import.meta.env.VITE_SUPPLIER_API_BASE_URL}${ENDPOINTS.supplier.uploadSupplierImage}`,
            formData,
            {
                withCredentials: true,
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            },
        );
        const body = response.data.data;
        if (!body) {
            throw new Error("No image URL returned from server");
        }
        return body.imageUrl;
    } catch (error) {
        throw parseError(error);
    }
};
