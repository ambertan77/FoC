// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated getMyBalance and getMyTransactions controllers that require an authenticated user and validate query parameters with Zod.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import type { Response } from "express";
import { AppError } from "../errors/errors.js";
import { prisma } from "../libs/prisma.js";
import { getCreditBalance, getCreditTransactions } from "../services/credit.service.js";
import { transactionQuerySchema } from "../schemas/credit.schema.js";
import type { AuthRequest } from "../types/auth.types.js";
import type { BalanceResponse, TransactionsResponse } from "../types/credit.types.js";

export async function getMyBalance(req: AuthRequest, res: Response<BalanceResponse>) {
    if (!req.user) throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
    if (Object.keys(req.query).length > 0) {
        throw new AppError("Invalid query parameters", 400);
    }

    const data = await getCreditBalance(prisma, req.user.userId);
    if (data.status === "PROVISIONING") {
        return res.status(202).json({ success: true, data });
    }
    return res.status(200).json({ success: true, data });
}

export async function getMyTransactions(req: AuthRequest, res: Response<TransactionsResponse>) {
    if (!req.user) throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
    const query = transactionQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError("Invalid query parameters", 400);

    const data = await getCreditTransactions(prisma, req.user.userId, query.data);
    if (data.status === "PROVISIONING") {
        return res.status(202).json({ success: true, data });
    }
    return res.status(200).json({ success: true, data });
}
