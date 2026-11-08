// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated Zod schemas for the new email and the 6-digit verification code.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from 'zod';
import { emailSchema } from '@/features/auth/schemas/register.schema';

export const emailChangeSchema = z.strictObject({
    email: emailSchema,
});

export const emailChangeOtpSchema = z.strictObject({
    otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
});

export type EmailChangePayload = z.infer<typeof emailChangeSchema>;
export type EmailChangeOtpFields = z.infer<typeof emailChangeOtpSchema>;

export interface ResendEmailChangeOtpPayload {
    challengeId: string;
}

export interface VerifyEmailChangePayload extends EmailChangeOtpFields {
    challengeId: string;
}
