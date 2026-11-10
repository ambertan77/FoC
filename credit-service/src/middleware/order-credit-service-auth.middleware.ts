// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Removed per-request user logging (PII); auth failures now log at debug through the pino logger.
// Author review: Reviewed, tested, checked by the author.

// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Shared-secret authentication for synchronous reservation routes.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

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