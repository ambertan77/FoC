// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Replaced console.* with the pino logger and removed token and personal-data logging.
// Author review: Reviewed, tested, checked by the author.

import argon2 from "argon2";
import { AppError } from "../errors/errors.js";
import { prisma } from "../libs/prisma.js";
import { generateRefreshToken, verifyRefreshToken } from "../libs/refreshToken.js";
import { generateAccessToken } from "../libs/accessToken.js";
import { REFRESH_TOKEN_MAX_AGE } from "../constants/auth.constants.js";
import { logger } from "../libs/logger.js";

export async function refreshAccessToken(refreshToken: string) {
    // 1. Verify the refresh token using jwt and the secret key
    const payload = verifyRefreshToken(refreshToken);

    // 2. Find the exact refresh token in the database using the jti (tokenId)
    const storedToken = await prisma.refreshToken.findUnique({
        where: {
            tokenId: payload.jti,
        },
        include: {
            user: true,
        },
    });

    if (!storedToken) {
        logger.warn({ userId: payload.userId, reason: "not_found" }, "Refresh token rejected");
        throw new AppError("Invalid token, please sign out and back in", 401);
    }

    // 3. Check if the refresh token has already been revoked
    if (storedToken.revokedAt) {
        logger.warn({ userId: payload.userId, reason: "revoked" }, "Refresh token rejected");
        throw new AppError("Invalid token, please sign out and back in", 401);
    }

    // 4. Check if the refresh token has expired
    if (storedToken.expiresAt < new Date()) {
        logger.warn({ userId: payload.userId, reason: "expired" }, "Refresh token rejected");
        throw new AppError("Invalid token, please sign out and back in", 401);
    }

    // 5. Verify the refresh token against the stored hash
    const refreshTokenValid = await argon2.verify(storedToken.tokenHash, refreshToken);
    if (!refreshTokenValid) {
        logger.warn({ userId: payload.userId, reason: "hash_mismatch" }, "Refresh token rejected");
        throw new AppError("Invalid token, please sign out and back in", 401);
    }

    // Refresh token is valid and exists in the database
    const user = storedToken.user;

    // 6. Revoke ONLY the current refresh token that was used to request a new access token
    const revoked = await prisma.refreshToken.updateMany({
        where: {
            tokenId: payload.jti,
            revokedAt: null,
        },
        data: {
            revokedAt: new Date(),
        }
    });

    // Check if the refresh token was successfully revoked
    if (revoked.count !== 1) {
        logger.warn({ userId: payload.userId, reason: "revoke_failed" }, "Refresh token rejected");
        throw new AppError("Invalid token, please sign out and back in", 401);
    }

    // 7. Generate a new access token
    const newAccessToken = generateAccessToken({
        userId: user.userId,
        email: user.email,
        role: user.role,
    });

    // 8. Generate a new refresh token
    const { refreshToken: newRefreshToken, tokenId: newTokenId } = generateRefreshToken(user.userId);
    const newTokenHash = await argon2.hash(newRefreshToken);

    // 9. Store the new refresh token in the database
    await prisma.refreshToken.create({
        data: {
            tokenId: newTokenId,
            tokenHash: newTokenHash,
            userId: user.userId,
            expiresAt: new Date(
                Date.now() + REFRESH_TOKEN_MAX_AGE
            ),
        },
    });

    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
            id: user.userId,
            email: user.email,
            username: user.username,
            phoneNumber: user.phoneNumber,
            role: user.role,
        },
    }
}
