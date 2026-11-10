import type { Response, NextFunction } from "express";
import { AppError } from "../errors/errors.js";
import type { AuthRequest, Role } from "../types/auth.types.js";

export function authorize(...allowedRoles: Role[]) {
    return (
        req: AuthRequest,
        _res: Response,
        next: NextFunction,
    ) => {
        if (!req.user) {
            throw new AppError("Authentication required", 401);
        }

        if (!allowedRoles.includes(req.user.role)) {
            throw new AppError(
                "You do not have permission to access this resource",
                403
            );
        }

        next();
    };
}