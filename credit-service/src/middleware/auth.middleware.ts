// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Removed per-request user logging (PII); auth failures now log at debug through the pino logger.
// Author review: Reviewed, tested, checked by Duong Ngoc Mai.

import fs from "node:fs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Response, NextFunction } from "express";
import { AppError } from "../errors/errors.js";
import config from "../config/config.js";
import { z } from "zod";
import { Role, type AuthRequest } from "../types/auth.types.js";
import { logger } from "../libs/logger.js";

const publicKey = fs.readFileSync(config.jwtPublicKeyPath, "utf8");

export function authenticate(
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        logger.debug("Authorization header does not start with Bearer");
        throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
    }

    const accessToken = authHeader.replace("Bearer ", "").trim();

    if (!accessToken) {
        logger.debug("Access token is missing after Bearer");
        throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
    }

    try {
        const payload = jwt.verify(accessToken, publicKey, {
            algorithms: ["RS256"],
        }) as JwtPayload & {
            userId?: unknown;
            email?: unknown;
            role?: unknown;
        };

        if (
            !z.uuid().safeParse(payload.userId).success ||
            typeof payload.userId !== "string" ||
            typeof payload.email !== "string" ||
            (payload.role !== Role.STUDENT && payload.role !== Role.ADMIN)
        ) {
            throw new Error("Invalid access token payload");
        }

        req.user = {
            userId: payload.userId.toLowerCase(),
            email: payload.email,
            role: payload.role,
        };

    } catch {
        logger.debug("Access token is invalid or expired");
        throw new AppError(
            "Invalid token, please sign out and back in",
            401
        );
    }
    next();
}
