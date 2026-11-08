// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated the Zod schema for the admin invitation email.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from 'zod';
import { emailSchema } from '@/features/auth/schemas/register.schema';

export const createAdminInvitationSchema = z.strictObject({
    email: emailSchema,
});

export type CreateAdminInvitationPayload = z.infer<
    typeof createAdminInvitationSchema
>;
