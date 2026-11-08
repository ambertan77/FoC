// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the Zod schema for username and phone profile edits.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from 'zod';
import {
    emailSchema,
    phoneNumberSchema,
    usernameSchema,
} from '@/features/auth/schemas/register.schema';

export const updateProfileSchema = z.strictObject({
    username: usernameSchema,
    phoneNumber: phoneNumberSchema,
});

export const profileDetailsSchema = z.strictObject({
    email: emailSchema,
    username: usernameSchema,
    phoneNumber: phoneNumberSchema,
});

export type UpdateProfilePayload = z.infer<typeof updateProfileSchema>;
