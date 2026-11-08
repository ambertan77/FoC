// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-26
// Scope: Generated Zod schemas for the activation token and the admin activation form.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from 'zod';
import {
    passwordSchema,
    phoneNumberSchema,
    usernameSchema,
} from './register.schema';

export const adminActivationTokenSchema = z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid administrator activation link');

export const adminActivationFormSchema = z.strictObject({
    username: usernameSchema,
    phoneNumber: phoneNumberSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm your password'),
}).refine(
    value => value.password === value.confirmPassword,
    {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    },
);

export type AdminActivationFormValues = z.infer<
    typeof adminActivationFormSchema
>;

export type AdminActivationPayload = Omit<
    AdminActivationFormValues,
    'confirmPassword'
> & { token: string };
