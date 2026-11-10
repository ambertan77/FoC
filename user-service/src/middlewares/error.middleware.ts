// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Logs unhandled and 5xx errors through the pino logger instead of console.
// Author review: Pending review by the author.

import type { ErrorRequestHandler } from "express";
import { AppError, DEFAULT_ERRORS } from "../errors/errors.js";
import { logger } from "../libs/logger.js";

export const errorHandler: ErrorRequestHandler = (
    err,
    _req,
    res,
    _next,
) => {
    // Expected 4xx errors are already in the access log; keep stacks for real failures.
    if (!(err instanceof AppError) || err.statusCode >= 500) {
        logger.error({ err }, "Unhandled request error");
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            code: err.code,
            message: err.message,
        });
    }

    return res.status(500).json({
        success: false,
        code: DEFAULT_ERRORS[500],
        message: "An unexpected error occurred",
    });
};