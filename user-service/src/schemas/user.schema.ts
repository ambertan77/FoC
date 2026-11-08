// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated Zod schemas for list-users pagination, role update, profile update (at least one field), email change and password change.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from "zod";
import {
  emailSchema,
  passwordSchema,
  phoneNumberSchema,
  usernameSchema,
} from "./register.schema.js";

const positiveIntegerQuerySchema = (fieldName: string) =>
  z
    .string()
    .regex(/^\d+$/, `${fieldName} must be a positive integer`)
    .transform(Number)
    .refine((value) => value >= 1, `${fieldName} must be a positive integer`);

export const listUsersQuerySchema = z.strictObject({
  search: z
    .string()
    .trim()
    .max(100, "Search must be at most 100 characters")
    .optional()
    .transform((value) => value || undefined),
  role: z.enum(["STUDENT", "ADMIN"]).optional(),
  page: positiveIntegerQuerySchema("Page").default(1),
  pageSize: positiveIntegerQuerySchema("Page size")
    .refine((value) => value <= 100, "Page size must be at most 100")
    .default(20),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const createAdminInvitationSchema = z.strictObject({
  email: emailSchema,
});

export type CreateAdminInvitationInput = z.infer<
  typeof createAdminInvitationSchema
>;

export const updateUserRoleParamsSchema = z.strictObject({
  userId: z.uuid({ error: "Invalid user ID" }),
});

export const updateUserRoleSchema = z.strictObject({
  role: z.literal("ADMIN", { error: "Role must be ADMIN" }),
});

export const updateMyProfileSchema = z
  .strictObject({
    username: usernameSchema.optional(),
    phoneNumber: phoneNumberSchema.optional(),
  })
  .refine(
    (value) => value.username !== undefined || value.phoneNumber !== undefined,
    { message: "Provide a username or phone number to update" },
  );

export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;

export const startEmailChangeSchema = z.strictObject({
  email: emailSchema,
});

export const resendEmailChangeOtpSchema = z.strictObject({
  challengeId: z.uuid({ error: "Invalid email change challenge" }),
});

export const verifyEmailChangeSchema = z.strictObject({
  challengeId: z.uuid({ error: "Invalid email change challenge" }),
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit verification code"),
});

export type StartEmailChangeInput = z.infer<typeof startEmailChangeSchema>;
export type ResendEmailChangeOtpInput = z.infer<typeof resendEmailChangeOtpSchema>;
export type VerifyEmailChangeInput = z.infer<typeof verifyEmailChangeSchema>;

export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: passwordSchema,
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
