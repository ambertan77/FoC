// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Removed per-request user logging (PII); auth failures now log at debug through the pino logger.
// Author review: Reviewed, tested, checked by the author.

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