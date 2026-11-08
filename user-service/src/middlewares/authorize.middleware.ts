// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the authorize(...roles) middleware returning 401 without a user and 403 for a disallowed role.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import type { Response, NextFunction } from "express";
import { AppError } from "../errors/errors.js";
import type { AuthenticatedRequest } from "../types/auth.types.js";
import type { Role } from "../generated/prisma/client.js";

export function authorize(...allowedRoles: Role[]) {
    return (
        req: AuthenticatedRequest,
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
