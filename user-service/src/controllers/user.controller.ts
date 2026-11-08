// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated controllers for profile, email change, password change, admin invitation, user listing and role promotion, validating requests with Zod safeParse.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import type { Request, Response } from "express";
import { AppError } from "../errors/errors.js";
import {
  changePasswordSchema,
  createAdminInvitationSchema,
  listUsersQuerySchema,
  resendEmailChangeOtpSchema,
  startEmailChangeSchema,
  updateMyProfileSchema,
  updateUserRoleParamsSchema,
  updateUserRoleSchema,
  verifyEmailChangeSchema,
} from "../schemas/user.schema.js";
import {
  getPendingEmailChange,
  resendEmailChangeOtp as resendEmailChangeOtpService,
  startEmailChange as startEmailChangeService,
  verifyEmailChange as verifyEmailChangeService,
} from "../services/email-change.service.js";
import {
  createAdminInvitation as createAdminInvitationService,
} from "../services/admin-invitation.service.js";
import {
  changePassword as changePasswordService,
  getMyProfile as getMyProfileService,
  getUserByIdService,
  listUsers as listUsersService,
  promoteUserToAdmin,
  updateMyProfile as updateMyProfileService,
} from "../services/user.service.js";
import type { AuthenticatedRequest } from "../types/auth.types.js";
import { refreshTokenCookieOptions } from "../libs/cookies.js";

function getAuthenticatedUserId(req: AuthenticatedRequest): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }

  return req.user.userId;
}

export async function createAdminInvitation(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = createAdminInvitationSchema.safeParse(req.body);

  if (!result.success) {
    throw new AppError(
      result.error.issues.at(0)?.message || "Invalid request",
      400,
    );
  }

  await createAdminInvitationService(result.data);

  return res.status(202).json({
    success: true,
    message: "Administrator invitation sent.",
  });
}

export async function listUsers(req: AuthenticatedRequest, res: Response) {
  const result = listUsersQuerySchema.safeParse(req.query);

  if (!result.success) {
    throw new AppError(
      result.error.issues.at(0)?.message || "Invalid request",
      400,
    );
  }

  const data = await listUsersService(result.data);

  return res.status(200).json({
    success: true,
    data,
  });
}

export async function updateUserRole(
  req: AuthenticatedRequest,
  res: Response,
) {
  const paramsResult = updateUserRoleParamsSchema.safeParse(req.params);
  const bodyResult = updateUserRoleSchema.safeParse(req.body);

  if (!paramsResult.success) {
    throw new AppError(
      paramsResult.error.issues.at(0)?.message || "Invalid request",
      400,
    );
  }

  if (!bodyResult.success) {
    throw new AppError(
      bodyResult.error.issues.at(0)?.message || "Invalid request",
      400,
    );
  }

  const user = await promoteUserToAdmin(
    getAuthenticatedUserId(req),
    paramsResult.data.userId,
  );

  return res.status(200).json({
    success: true,
    data: { user },
  });
}

export async function getMyProfile(req: AuthenticatedRequest, res: Response) {
  const userId = getAuthenticatedUserId(req);
  const [user, pendingEmailChange] = await Promise.all([
    getMyProfileService(userId),
    getPendingEmailChange(userId),
  ]);

  return res.status(200).json({
    success: true,
    data: { user, pendingEmailChange },
  });
}

export async function updateMyProfile(req: AuthenticatedRequest, res: Response) {
  const result = updateMyProfileSchema.safeParse(req.body);

  if (!result.success) {
    throw new AppError(
      result.error.issues.at(0)?.message || "Invalid request",
      400,
    );
  }

  const user = await updateMyProfileService(
    getAuthenticatedUserId(req),
    result.data,
  );

  return res.status(200).json({
    success: true,
    data: { user },
  });
}

export async function startEmailChange(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = startEmailChangeSchema.safeParse(req.body);

  if (!result.success) {
    throw new AppError(
      result.error.issues.at(0)?.message || "Invalid request",
      400,
    );
  }

  const data = await startEmailChangeService(
    getAuthenticatedUserId(req),
    result.data,
  );

  return res.status(202).json({
    success: true,
    data,
  });
}

export async function resendEmailChangeOtp(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = resendEmailChangeOtpSchema.safeParse(req.body);

  if (!result.success) {
    throw new AppError(
      result.error.issues.at(0)?.message || "Invalid request",
      400,
    );
  }

  const data = await resendEmailChangeOtpService(
    getAuthenticatedUserId(req),
    result.data,
  );

  return res.status(202).json({
    success: true,
    data,
  });
}

export async function verifyEmailChange(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = verifyEmailChangeSchema.safeParse(req.body);

  if (!result.success) {
    throw new AppError(
      result.error.issues.at(0)?.message || "Invalid request",
      400,
    );
  }

  const user = await verifyEmailChangeService(
    getAuthenticatedUserId(req),
    result.data,
  );

  return res.status(200).json({
    success: true,
    data: { user },
  });
}

export async function changePassword(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = changePasswordSchema.safeParse(req.body);

  if (!result.success) {
    throw new AppError(
      result.error.issues.at(0)?.message || "Invalid request",
      400,
    );
  }

  const { refreshToken } = await changePasswordService(
    getAuthenticatedUserId(req),
    result.data,
  );
  res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);

  return res.status(200).json({
    success: true,
    message: "Password changed successfully.",
  });
}

export async function getUserById(req: Request, res: Response) {
  const userId = req.params.userId;

  if (typeof userId !== "string" || !userId) {
    throw new AppError("User id is required", 400);
  }

  const user = await getUserByIdService(userId);

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  res.status(200).json({
    success: true,
    message: "User fetched successfully",
    data: user,
  });
}