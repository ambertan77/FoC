// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-25
// Scope: Generated Zod schemas for username, email, Singapore phone normalisation, password strength, and the register/resend/verify payloads.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from "zod";

export const usernameSchema = z
  .string()
  .min(3, "Username must have at least 3 characters")
  .max(30, "Username must have at most 30 characters")
  .regex(/^[A-Za-z0-9]+$/, "Use only letters and numbers");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address" }));

export const phoneNumberSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[ -]/g, ""))
  .pipe(
    z
      .string()
      .regex(
        /^(?:\+65)?[89]\d{7}$/,
        "Enter an 8-digit Singapore mobile number starting with 8 or 9",
      ),
  )
  .transform((value) => (value.startsWith("+65") ? value : `+65${value}`));

export const passwordSchema = z
  .string()
  .min(8, "Password must have at least 8 characters")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[0-9]/, "Include a number")
  .regex(/[\p{P}\p{S}]/u, "Include a special character");

export const registerSchema = z.strictObject({
  username: usernameSchema,
  email: emailSchema,
  phoneNumber: phoneNumberSchema,
  password: passwordSchema,
});

export const resendRegistrationOtpSchema = z.strictObject({
  challengeId: z.uuid({ error: "Invalid registration challenge" }),
});

export const verifyRegistrationSchema = z.strictObject({
  challengeId: z.uuid({ error: "Invalid registration challenge" }),
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit verification code"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type ResendRegistrationOtpInput = z.infer<
  typeof resendRegistrationOtpSchema
>;
export type VerifyRegistrationInput = z.infer<typeof verifyRegistrationSchema>;
