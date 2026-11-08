// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Helped write verifyAccessToken payload validation (rejecting unknown roles) and mapping invalid or expired tokens to AppError.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import fs from "node:fs";
import { createPublicKey } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { ACCESS_TOKEN_EXPIRES_IN } from "../constants/auth.constants.js";
import config from "../config/config.js";
import { Role } from "../generated/prisma/client.js";
import { AppError } from "../errors/errors.js";
import type { AuthenticatedUser } from "../types/auth.types.js";

const privateKey = fs.readFileSync(config.jwtPrivateKeyPath, "utf8");
const publicKey = fs.readFileSync(config.jwtPublicKeyPath, "utf8");

export interface AccessTokenPayload {
    userId: string;
    email: string;
    role: Role;
}

export function generateAccessToken(payload: AccessTokenPayload) {
    return jwt.sign(payload, privateKey, {
        algorithm: "RS256",
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });
}

export function verifyAccessToken(token: string): AuthenticatedUser {
    try {
        const payload = jwt.verify(token, publicKey, {
            algorithms: ["RS256"],
        }) as JwtPayload;

        if (
            typeof payload.userId !== "string"
            || typeof payload.email !== "string"
            || (payload.role !== Role.STUDENT && payload.role !== Role.ADMIN)
        ) {
            throw new Error("Invalid access token payload");
        }

        return {
            userId: payload.userId,
            email: payload.email,
            role: payload.role,
        };
    } catch {
        throw new AppError(
            "Invalid token, please sign out and back in",
            401,
            "INVALID_ACCESS_TOKEN",
        );
    }
}
