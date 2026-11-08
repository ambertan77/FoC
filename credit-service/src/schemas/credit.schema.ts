// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated Zod schemas for the transaction-history query (type filter, asc/desc sort) and the cursor payload.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from "zod";
import { CreditTransactionType } from "../generated/prisma/client.js";

export const transactionQuerySchema = z.strictObject({
    type: z.enum(CreditTransactionType).optional(),
    sort: z.enum(["asc", "desc"]).default("desc"),
    limit: z.string()
        .regex(/^[0-9]+$/)
        .transform(Number)
        .pipe(z.number().int().min(1).max(100))
        .default(20),
    cursor: z.string().min(1).max(1024).optional(),
});

export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

export const transactionCursorSchema = z.strictObject({
    version: z.literal(1),
    accountId: z.uuid().transform(value => value.toLowerCase()),
    type: z.enum(CreditTransactionType).nullable(),
    sort: z.enum(["asc", "desc"]),
    transactionId: z.uuid().transform(value => value.toLowerCase()),
});

export type TransactionCursor = z.infer<typeof transactionCursorSchema>;
