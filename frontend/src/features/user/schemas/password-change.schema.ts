// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the Zod schema for password change, requiring a matching confirmation and a different new password.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from 'zod';
import { passwordSchema } from '@/features/auth/schemas/register.schema';

export const changePasswordSchema = z.strictObject({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
}).refine(
    value => value.newPassword === value.confirmPassword,
    {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    },
);

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
export type ChangePasswordPayload = Pick<
    ChangePasswordFormValues,
    'currentPassword' | 'newPassword'
>;
