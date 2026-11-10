import type { ErrorRequestHandler } from "express";
import { AppError, DEFAULT_ERRORS } from "../errors/errors.js";

export const errorHandler: ErrorRequestHandler = (
    err,
    _req,
    res,
    _next,
) => {
    console.error(err);

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