// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated getCreditBalance, getCreditTransactions (cursor pagination, PROVISIONING when no account exists) and the idempotent 50-credit grantInitialCredits with P2002 handling.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from "zod";
import {
    CreditTransactionType,
    Prisma,
    type CreditAccount,
    type CreditTransaction,
    type PrismaClient,
} from "../generated/prisma/client.js";
import { AppError } from "../errors/errors.js";
import type { BalanceResponse, TransactionsResponse } from "../types/credit.types.js";
import type { TransactionQuery } from "../schemas/credit.schema.js";
import { decodeTransactionCursor, encodeTransactionCursor } from "../libs/credit-cursor.js";
import { creditTransaction } from "../libs/credit-transaction.js";
import type { AbortReservationInput, ReservationInput } from "../schemas/reservation.schema.js";
import { randomUUID } from "node:crypto";

/** Read current balances without provisioning or changing the account. */
export async function getCreditBalance(
    prisma: PrismaClient,
    userId: string,
): Promise<BalanceResponse["data"]> {
    const account = await prisma.creditAccount.findUnique({
        where: { userId },
        select: { availableCredits: true, reservedCredits: true, updatedAt: true },
    });

    if (!account) return { status: "PROVISIONING" };

    return {
        status: "READY",
        availableCredits: account.availableCredits,
        reservedCredits: account.reservedCredits,
        updatedAt: account.updatedAt.toISOString(),
    };
}

/** Read an account-scoped ledger page; never provision an absent account. */
export async function getCreditTransactions(
    prisma: PrismaClient,
    userId: string,
    query: TransactionQuery,
): Promise<TransactionsResponse["data"]> {
    // Reject malformed tokens even when the account is not provisioned yet.
    const cursor = query.cursor === undefined ? undefined : decodeTransactionCursor(query.cursor);
    const account = await prisma.creditAccount.findUnique({
        where: { userId },
        select: { id: true },
    });
    if (!account) return { status: "PROVISIONING" };

    const where: Prisma.CreditTransactionWhereInput = {
        accountId: account.id,
        ...(query.type === undefined ? {} : { type: query.type }),
    };

    if (cursor) {
        if (cursor.accountId !== account.id || cursor.type !== (query.type ?? null) || cursor.sort !== query.sort) {
            throw new AppError("Invalid cursor", 400);
        }
        const anchor = await prisma.creditTransaction.findFirst({
            where: { ...where, id: cursor.transactionId },
            select: { id: true },
        });
        if (!anchor) throw new AppError("Invalid cursor", 400);
    }

    const rows = await prisma.creditTransaction.findMany({
        where,
        orderBy: [{ createdAt: query.sort }, { id: query.sort }],
        take: query.limit + 1,
        // Prisma resolves the anchor's ordering values in PostgreSQL, preserving
        // microseconds that would be lost by using a JavaScript Date boundary.
        ...(cursor ? { cursor: { id: cursor.transactionId }, skip: 1 } : {}),
        select: {
            id: true,
            type: true,
            amount: true,
            availableDelta: true,
            reservedDelta: true,
            createdAt: true,
            orderId: true,
        },
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const nextCursor = rows.length > query.limit && last
        ? encodeTransactionCursor({
            version: 1,
            accountId: account.id,
            type: query.type ?? null,
            sort: query.sort,
            transactionId: last.id,
        })
        : null;

    return {
        status: "READY",
        items: page.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
        nextCursor,
    };
}

const INITIAL_CREDITS = 50;
const userIdSchema = z.uuid().transform((value) => value.toLowerCase());

export interface InitialCreditGrantResult {
    account: CreditAccount;
    transaction: CreditTransaction;
    created: boolean;
}

/**
 * Provision a verified student's initial credits. The caller owns eligibility
 * checks; this internal function does not query user-service or expose an API.
 * Duplicate calls return the original grant and current balances unchanged.
 */
export async function grantInitialCredits(
    prisma: PrismaClient,
    userId: string,
): Promise<InitialCreditGrantResult> {
    const parsedUserId = userIdSchema.safeParse(userId);
    if (!parsedUserId.success) {
        throw new AppError("userId must be a valid UUID", 400, "INVALID_USER_ID");
    }

    const normalizedUserId = parsedUserId.data;
    const idempotencyKey = `initial-allocation:${normalizedUserId}`;

    // Only a conflict during account creation can represent a duplicate call.
    // Failures writing the ledger must always propagate after rollback.
    let accountCreated = false;
    try {
        return await prisma.$transaction(async (tx) => {
            const account = await tx.creditAccount.create({
                data: {
                    userId: normalizedUserId,
                    availableCredits: INITIAL_CREDITS,
                    reservedCredits: 0,
                },
            });
            accountCreated = true;

            const transaction = await tx.creditTransaction.create({
                data: {
                    accountId: account.id,
                    type: CreditTransactionType.INITIAL_ALLOCATION,
                    amount: INITIAL_CREDITS,
                    availableDelta: INITIAL_CREDITS,
                    reservedDelta: 0,
                    orderId: null,
                    idempotencyKey,
                },
            });

            return { account, transaction, created: true };
        });
    } catch (error) {
        if (
            accountCreated ||
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== "P2002"
        ) {
            throw error;
        }

        // The failed transaction has rolled back. A concurrent winner's account
        // and grant are now committed together; never query the aborted tx.
        const existing = await prisma.creditAccount.findUnique({
            where: { userId: normalizedUserId },
            include: {
                transactions: {
                    where: { type: CreditTransactionType.INITIAL_ALLOCATION },
                },
            },
        });

        // An unrelated uniqueness failure is not successful provisioning.
        if (!existing) {
            throw error;
        }

        const { transactions, ...account } = existing;
        const transaction = transactions[0];
        if (
            transactions.length !== 1 ||
            !transaction ||
            transaction.idempotencyKey !== idempotencyKey ||
            transaction.amount !== INITIAL_CREDITS ||
            transaction.availableDelta !== INITIAL_CREDITS ||
            transaction.reservedDelta !== 0 ||
            transaction.orderId !== null
        ) {
            throw new AppError(
                "Credit account exists without a valid initial allocation; investigation is required",
                500,
                "CREDIT_ACCOUNT_INCONSISTENT",
            );
        }

        return { account, transaction, created: false };
    }
}

export async function reserveCredits(prisma: PrismaClient, input: ReservationInput) {
    const { orderId, requesterId, amount } = input;
    return creditTransaction(prisma, async tx => {
        const account = await tx.creditAccount.findUnique({ where: { userId: requesterId } });
        if (!account) throw new AppError("Credit account not found", 404);
        const reservation = await tx.creditReservation.create({
            data: {
                orderId, requesterId, amount, accountId: account.id, requestEventId: randomUUID(),
            }
        });
        const updated = await tx.creditAccount.updateMany({
            where: { id: account.id, availableCredits: { gte: amount }, reservedCredits: { lte: 2_147_483_647 - amount } },
            data: { availableCredits: { decrement: amount }, reservedCredits: { increment: amount } },
        });
        if (updated.count !== 1) throw new AppError("Insufficient available credits or reserved balance would overflow", 409);
        await tx.creditTransaction.create({
            data: {
                accountId: account.id, reservationId: reservation.id, orderId,
                type: "RESERVATION", amount, availableDelta: -amount, reservedDelta: amount,
                idempotencyKey: `${reservation.id}:RESERVATION:${account.id}`,
            }
        });
        return { reservation, created: true };
    });
}

export async function abortReservation(prisma: PrismaClient, input: AbortReservationInput) {
    const { reservationId, orderId, requesterId, amount } = input;
    return creditTransaction(prisma, async tx => {
        const existing = await tx.creditReservation.findUnique({ where: { id: reservationId } });
        if (!existing) throw new AppError("Reservation not found", 404);
        if (existing.orderId !== orderId || existing.requesterId !== requesterId || existing.amount !== amount) {
            throw new AppError("Reservation identifiers or amount do not match", 409);
        }
        if (existing.status === "ABORTED") return { reservation: existing, created: false };
        if (existing.status !== "RESERVED") throw new AppError("Settled reservation cannot be aborted", 409);
        const account = await tx.creditAccount.findUnique({ where: { userId: requesterId } });
        if (!account || account.id !== existing.accountId) throw new AppError("Reservation account is inconsistent", 409);
        const updated = await tx.creditAccount.updateMany({
            where: { id: account.id, reservedCredits: { gte: amount }, availableCredits: { lte: 2_147_483_647 - amount } },
            data: { availableCredits: { increment: amount }, reservedCredits: { decrement: amount } },
        });
        if (updated.count !== 1) throw new AppError("Reserved balance is inconsistent or available balance would overflow", 409);
        const reservation = await tx.creditReservation.update({
            where: { id: existing.id },
            data: { status: "ABORTED", settlementReason: "CREATION_ABORTED", settledAt: new Date() },
        });
        await tx.creditTransaction.create({
            data: {
                accountId: account.id, reservationId: reservation.id, orderId,
                type: "RELEASE", amount, availableDelta: amount, reservedDelta: -amount,
                idempotencyKey: `${reservation.id}:RELEASE:${account.id}`,
            }
        });
        return { reservation, created: false };
    });
}

export async function getReservation(prisma: PrismaClient, reservationId: string) {
    return creditTransaction(prisma, async tx => {
        const reservation = await tx.creditReservation.findUnique({ where: { id: reservationId } });
        if (!reservation) throw new AppError("Reservation not found", 404);
        return reservation;
    });
}

