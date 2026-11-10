import crypto from "node:crypto";
import jwt, { type Secret } from "jsonwebtoken";
import { AppError } from "../errors/errors.js";
import { REFRESH_TOKEN_EXPIRES_IN } from "../constants/auth.constants.js";
import config from "../config/config.js";
import { logger } from "./logger.js";

const key: Secret = config.jwtRefreshTokenKey;

export interface RefreshTokenPayload {
    userId: string;
    jti: string;
}

export function generateRefreshToken(userId: string) {
    const tokenId = crypto.randomUUID();

    const refreshToken = jwt.sign(
        {
            userId,
        },
        key,
        {
            jwtid: tokenId,
            algorithm: "HS256",
            expiresIn: REFRESH_TOKEN_EXPIRES_IN,
        },
    );

    return {
        refreshToken,
        tokenId,
    };
}

export function verifyRefreshToken(
    token: string,
): RefreshTokenPayload {
    try {
        const payload = jwt.verify(
            token,
            key,
            {
                algorithms: ["HS256"],
            },
        ) as jwt.JwtPayload;

        if (
            typeof payload.userId !== "string" ||
            typeof payload.jti !== "string"
        ) {
            throw new Error("Invalid refresh token payload");
        }

        return {
            userId: payload.userId,
            jti: payload.jti,
        };
    } catch {
        logger.warn("Invalid or expired refresh token");
        throw new AppError(
            "Invalid token, please sign out and back in",
            401,
        );
    }
}