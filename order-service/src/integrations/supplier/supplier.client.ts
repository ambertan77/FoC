// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Added an axios interceptor that forwards X-Request-Id to supplier-service.
// Author review: Reviewed, tested, checked by Duong Ngoc Mai.

import axios from "axios";
import config from "../../config/config.js";
import { AppError } from "../../errors/errors.js";
import { requestContext } from "../../libs/logger.js";

const supplierApi = axios.create({
    baseURL: config.supplierServiceUrl,
    timeout: 5_000,
    headers: {
        "X-Order-Supplier-Service-Secret":
            config.orderSupplierServiceToken,
    },
});

// Forward the caller's request ID so one request can be followed across services.
supplierApi.interceptors.request.use((request) => {
    const reqId = requestContext.getStore()?.reqId;
    if (reqId) request.headers.set("X-Request-Id", reqId);
    return request;
});

export async function verifySupplierExists(
    supplierId: string,
): Promise<boolean> {
    try {
        await supplierApi.get(`/api/internal/suppliers/${supplierId}`);
        return true;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;

            if (status === 404) {
                return false;
            }

            if (status === 401 || status === 403) {
                throw new AppError(
                    "Supplier Service authentication failed",
                    status
                );
            }
        }

        throw new AppError(
            "Unable to verify supplier with Supplier Service",
            502
        );
    }
}

