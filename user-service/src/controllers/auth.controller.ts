// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Replaced console.* with the pino logger and removed token and personal-data logging.
// Author review: Reviewed, tested, checked by the author.

import type { Request, Response } from "express";
import {
    adminActivationSchema,
    loginSchema,
} from "../schemas/auth.schema.js";
import { activateAdmin as activateAdminService } from "../services/admin-activation.service.js";
import { loginUser, logoutUser } from "../services/auth.service.js";
import { AppError } from "../errors/errors.js";
import { refreshAccessToken } from "../services/refresh.service.js";
import { refreshTokenCookieOptions } from "../libs/cookies.js";
import {
    registerSchema,
    resendRegistrationOtpSchema,
    verifyRegistrationSchema,
} from "../schemas/register.schema.js";
import {
    resendRegistrationOtp as resendRegistrationOtpService,
    startRegistration,
    verifyRegistration as verifyRegistrationService,
} from "../services/registration.service.js";
import { logger } from "../libs/logger.js";

export async function activateAdmin(req: Request, res: Response) {
    const result = adminActivationSchema.safeParse(req.body);

    if (!result.success) {
        throw new AppError(
            result.error.issues.at(0)?.message || "Invalid request",
            400,
        );
    }

    const user = await activateAdminService(result.data);

    return res.status(201).json({
        success: true,
        message: "Administrator account activated successfully.",
        data: { user },
    });
}

export async function register(req: Request, res: Response) {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
        throw new AppError(result.error.issues.at(0)?.message || "Invalid request", 400);
    }

    const data = await startRegistration(result.data);

    return res.status(202).json({
        success: true,
        data,
    });
}

export async function resendRegistrationOtp(req: Request, res: Response) {
    const result = resendRegistrationOtpSchema.safeParse(req.body);

    if (!result.success) {
        throw new AppError(result.error.issues.at(0)?.message || "Invalid request", 400);
    }

    const data = await resendRegistrationOtpService(result.data);

    return res.status(202).json({
        success: true,
        data,
    });
}

export async function verifyRegistration(req: Request, res: Response) {
    const result = verifyRegistrationSchema.safeParse(req.body);

    if (!result.success) {
        throw new AppError(result.error.issues.at(0)?.message || "Invalid request", 400);
    }

    const user = await verifyRegistrationService(result.data);

    return res.status(201).json({
        success: true,
        data: { user },
    });
}

export async function login(req: Request, res: Response) {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
        throw new AppError(result.error.issues.at(0)?.message || "Invalid request", 400);
    }
    const data = await loginUser(result.data);
    logger.info({ userId: data.user.id }, "Login successful");

    res.cookie("refreshToken", data.refreshToken, refreshTokenCookieOptions);

    return res.status(200).json({
        success: true,
        message: "Login successfully",
        data: {
            accessToken: data.accessToken,
            user: data.user,
        },
    });
}

export async function logout(req: Request, res: Response) {
    const refreshToken = req.signedCookies.refreshToken;

    // Clear the refresh token cookie
    res.clearCookie("refreshToken", refreshTokenCookieOptions);

    if (refreshToken) {
        try {
            await logoutUser(refreshToken);
            logger.info("Logout successful");
        } catch (error) {
            logger.error({ err: error }, "Error during logout");
            // Even if there's an error during logout, we still want
            // to clear the cookie and log the user out.
        }
    }
    return res.status(200).json({
        success: true,
        message: "Logged out successfully",
    });
}

export async function refresh(req: Request, res: Response) {
    const refreshToken = req.signedCookies.refreshToken;

    // Check if the refresh token is present in the cookies
    if (!refreshToken) {
        res.clearCookie("refreshToken", refreshTokenCookieOptions);
        logger.debug("No refresh token found in cookies");
        throw new AppError("Invalid, please sign out and back in", 401);
    }

    try {
        const result = await refreshAccessToken(refreshToken);
        res.cookie("refreshToken", result.refreshToken, refreshTokenCookieOptions);
        logger.debug("Refresh token rotation successful");

        return res.status(200).json({
            success: true,
            message: "Token refreshed successfully",
            data: {
                accessToken: result.accessToken,
                user: result.user,
            },
        });
    } catch (error) {
        if (error instanceof AppError && error.statusCode === 401) {
            logger.debug("Refresh token is invalid or expired, clearing cookie");
            res.clearCookie("refreshToken", refreshTokenCookieOptions);
        }

        throw error;
    }
}
