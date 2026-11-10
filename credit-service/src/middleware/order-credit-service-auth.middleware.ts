import type { RequestHandler } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "../errors/errors.js";
import { logger } from "../libs/logger.js";

function hash(value: string): Buffer {
    return createHash("sha256").update(value, "utf8").digest();
}

export const authenticateOrderCreditService: RequestHandler = (
    req, _res, next
) => {
    const expectedToken = process.env.ORDER_CREDIT_SERVICE_TOKEN;
    const providedToken = req.get("X-Order-Credit-Service-Secret");

    if (
        !expectedToken ||
        !providedToken ||
        !timingSafeEqual(hash(providedToken), hash(expectedToken))
    ) {
        next(new AppError("Service authentication required", 401));
        return;
    }

    logger.debug("Authenticated request from order-credit-service successfully");

    next();
};