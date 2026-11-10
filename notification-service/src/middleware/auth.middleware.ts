import fs from "node:fs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Response, NextFunction } from "express";
import { AppError } from "../errors/errors.js";
import config from "../config/config.js";
import type { AuthRequest, Role } from "../types/auth.types.js";

const publicKey = fs.readFileSync(config.jwtPublicKeyPath, "utf8");

export function authenticate(
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
) {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
        console.log("Authorization header does not start with Bearer");
        throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
    }

    const accessToken = authHeader.replace("Bearer ", "").trim();

    if (!accessToken) {
        console.log("Access token is missing after Bearer");
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
            typeof payload.userId !== "string" ||
            typeof payload.email !== "string" ||
            typeof payload.role !== "string"
        ) {
            throw new Error("Invalid access token payload");
        }

        req.user = {
            userId: payload.userId,
            email: payload.email,
            role: payload.role as Role,
        };

        console.log(`Authenticated user: ${req.user.email} with role: ${req.user.role}`);

        next();
    } catch {
        console.log("Access token is invalid or expired");
        throw new AppError(
            "Invalid token, please sign out and back in",
            401
        );
    }
}