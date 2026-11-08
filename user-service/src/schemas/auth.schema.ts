// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-09-25
// Scope: Helped write loginSchema email normalisation and adminActivationSchema token-format validation.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from "zod";
import {
    passwordSchema,
    phoneNumberSchema,
    usernameSchema,
} from "./register.schema.js";

export const loginSchema = z.object({
    email: z.string().trim().toLowerCase()
        .pipe(z.email({ pattern: z.regexes.email, error: "Invalid email format" })),
    password: z.string().min(1, {
        error: "Password is required",
    }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const adminActivationSchema = z.strictObject({
    token: z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/, "Invalid administrator activation token"),
    username: usernameSchema,
    phoneNumber: phoneNumberSchema,
    password: passwordSchema,
});

export type AdminActivationInput = z.infer<typeof adminActivationSchema>;
