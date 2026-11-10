// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Logs unhandled and 5xx errors through the pino logger instead of console.
// Author review: Reviewed, tested, checked by the author.

import type { ErrorRequestHandler } from "express";

import { AppError, DEFAULT_ERRORS } from "../errors/errors.js";
import { logger } from "../libs/logger.js";

const MULTER_CODES: Record<string, number> = {
    LIMIT_FILE_SIZE: 413,
    LIMIT_PART_COUNT: 400,
    LIMIT_FILE_COUNT: 400,
    LIMIT_FIELD_KEY: 400,
    LIMIT_FIELD_VALUE: 400,
    LIMIT_FIELD_COUNT: 400,
    LIMIT_UNEXPECTED_FILE: 400,
    MISSING_FIELD_NAME: 400,
    LIMIT_FIELD_NESTING: 400,
    LIMIT_FIELD_ARRAY_INDEX: 400,
    STREAM_DESTROYED: 500,
    INVALID_FIELD_NAME: 400,
};

export const errorHandler: ErrorRequestHandler = (
    err,
    _req,
    res,
    _next,
) => {
    // Expected 4xx errors are already in the access log; keep stacks for real failures.
    if (err instanceof AppError) {
        if (err.statusCode >= 500) logger.error({ err }, "Unhandled request error");
        return res.status(err.statusCode).json({
            success: false,
            code: err.code,
            message: err.message,
        });
    }

    const multerCode = err && typeof (err as { code?: unknown }).code === "string"
        ? (err as { code: string }).code
        : undefined;
    if (multerCode && MULTER_CODES[multerCode] !== undefined) {
        if (MULTER_CODES[multerCode] >= 500) logger.error({ err }, "Unhandled request error");
        return res.status(MULTER_CODES[multerCode]).json({
            success: false,
            code: MULTER_CODES[multerCode] === 413 ? "TOO_LARGE" : "BAD_REQUEST",
            message: (err as { message?: string }).message ?? `Invalid request (${multerCode})`,
        });
    }

    logger.error({ err }, "Unhandled request error");
    return res.status(500).json({
        success: false,
        code: DEFAULT_ERRORS[500],
        message: "An unexpected error occurred",
    });
};