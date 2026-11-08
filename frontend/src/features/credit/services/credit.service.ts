// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated creditKeys and the getCreditBalanceService/getCreditTransactionsService API calls with response validation.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from "zod";
import creditApi from "@/api/creditApi";
import { ENDPOINTS } from "@/api/endpoints";
import type { CreditBalance } from "../types/credit.types";
import {
    CREDIT_TRANSACTION_TYPES,
    type CreditTransactionParams,
    type CreditTransactions,
} from "../types/credit.types";

const balanceSchema = z.discriminatedUnion("status", [
    z.object({ status: z.literal("PROVISIONING") }),
    z.object({
        status: z.literal("READY"),
        availableCredits: z.number().int().nonnegative(),
        reservedCredits: z.number().int().nonnegative(),
        updatedAt: z.iso.datetime(),
    }),
]) satisfies z.ZodType<CreditBalance>;

const balanceResponseSchema = z.object({
    success: z.literal(true),
    data: balanceSchema,
});

export const getCreditBalanceService = async (
    signal?: AbortSignal,
): Promise<CreditBalance> => {
    const response = await creditApi.get<unknown>(ENDPOINTS.credit.balance, { signal });
    const result = balanceResponseSchema.safeParse(response.data);

    if (!result.success) {
        throw new Error("Invalid credit balance response");
    }

    return result.data.data;
};

const transactionsResponseSchema = z.object({
    success: z.literal(true),
    data: z.discriminatedUnion("status", [
        z.object({ status: z.literal("PROVISIONING") }),
        z.object({
            status: z.literal("READY"),
            items: z.array(z.object({
                id: z.uuid(),
                type: z.enum(CREDIT_TRANSACTION_TYPES),
                amount: z.number().int().positive(),
                availableDelta: z.number().int(),
                reservedDelta: z.number().int(),
                createdAt: z.iso.datetime(),
                orderId: z.uuid().nullable(),
            })),
            nextCursor: z.string().min(1).max(1024).nullable(),
        }),
    ]) satisfies z.ZodType<CreditTransactions>,
});

export const getCreditTransactionsService = async (
    params: CreditTransactionParams,
    signal?: AbortSignal,
): Promise<CreditTransactions> => {
    const response = await creditApi.get<unknown>(ENDPOINTS.credit.transactions, {
        params,
        signal,
    });
    const result = transactionsResponseSchema.safeParse(response.data);
    if (!result.success) throw new Error("Invalid credit transactions response");
    return result.data.data;
};
