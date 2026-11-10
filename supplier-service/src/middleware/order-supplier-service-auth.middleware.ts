import type { RequestHandler } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors/errors.js";
import { logger } from "../libs/logger.js";

function hash(value: string): Buffer {
    return createHash("sha256").update(value, "utf8").digest();
}

export const authenticateOrderSupplierService: RequestHandler = (
    req, _res, next
) => {
    const expectedToken = process.env.ORDER_SUPPLIER_SERVICE_TOKEN;
    const providedToken = req.get("X-Order-Supplier-Service-Secret");

    if (
        !expectedToken ||
        !providedToken ||
        !timingSafeEqual(hash(providedToken), hash(expectedToken))
    ) {
        next(new AppError("Service authentication required", 401));
        return;
    }

    logger.debug("Authenticated request from order-supplier-service successfully");

    next();
};