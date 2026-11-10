// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Transfer, release and refund credits with atomic balance, reservation and ledger updates and replay checks.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../errors/errors.js";
import { creditTransaction } from "../libs/credit-transaction.js";
import { receiptEventSchema, releaseEventSchema, refundEventSchema, type SettlementEvent } from "../schemas/settlement-event.schema.js";

export async function transferCredits(prisma: PrismaClient, input: unknown) {
    const parsed = receiptEventSchema.safeParse(input);
    if (!parsed.success) throw new AppError("Invalid receipt event", 400);
    if (parsed.data.requesterId === parsed.data.courierId) throw new AppError("Requester cannot receive their own transfer", 409);
    const { reservation, applied } = await settleCredits(prisma, parsed.data);
    return { reservation, transferred: applied };
}

export async function releaseCredits(prisma: PrismaClient, input: unknown) {
    const parsed = releaseEventSchema.safeParse(input);
    if (!parsed.success) throw new AppError("Invalid release event", 400);
    const { reservation, applied } = await settleCredits(prisma, parsed.data);
    return { reservation, released: applied };
}

export async function refundCredits(prisma: PrismaClient, input: unknown) {
    const parsed = refundEventSchema.safeParse(input);
    if (!parsed.success) throw new AppError("Invalid refund event", 400);
    const { reservation, applied } = await settleCredits(prisma, parsed.data);
    return { reservation, refunded: applied };
}

async function settleCredits(prisma: PrismaClient, event: SettlementEvent) {
    const isReceipt = event.eventType === "ORDER_RECEIVED";
    const isRefund = event.eventType === "ORDER_FAILED";
    const status = isReceipt ? "TRANSFERRED" : isRefund ? "REFUNDED" : "RELEASED";
    const reason = isReceipt ? "RECEIVED" : isRefund ? "FAILED" : event.eventType === "ORDER_CANCELED" ? "CANCELED" : "EXPIRED";
    const courierId = isReceipt ? event.courierId : null;
    try {
        return await creditTransaction(prisma, async tx => {
            const reservation = await tx.creditReservation.findUnique({ where: { id: event.reservationId } });
            if (!reservation) throw new AppError("Reservation not found", 404);
            if (reservation.orderId !== event.orderId || reservation.requesterId !== event.requesterId || reservation.amount !== event.amount) {
                throw new AppError("Settlement identifiers or amount do not match", 409);
            }
            if (reservation.status !== "RESERVED") {
                if (reservation.status === status && reservation.settlementEventId === event.eventId
                    && reservation.settlementReason === reason && reservation.courierId === courierId
                    && isDeepStrictEqual(reservation.settlementPayload, event)) return { reservation, applied: false };
                throw new AppError("Reservation already has a different terminal outcome", 409);
            }
            const requester = await tx.creditAccount.findUnique({ where: { userId: event.requesterId } });
            const courier = courierId ? await tx.creditAccount.findUnique({ where: { userId: courierId } }) : null;
            if (!requester || (isReceipt && !courier)) throw new AppError("Settlement account not found", 404);
            if (requester.id !== reservation.accountId) throw new AppError("Reservation account is inconsistent", 409);
            const claimed = await tx.creditReservation.updateMany({
                where: { id: reservation.id, status: "RESERVED" },
                data: { status, courierId, settlementEventId: event.eventId,
                    settlementReason: reason, settlementPayload: event, settledAt: new Date() },
            });
            if (claimed.count !== 1) throw new AppError("Reservation already settled", 409);
            const debited = await tx.creditAccount.updateMany({
                where: { id: requester.id, reservedCredits: { gte: reservation.amount },
                    ...(!isReceipt ? { availableCredits: { lte: 2_147_483_647 - reservation.amount } } : {}) },
                data: { reservedCredits: { decrement: reservation.amount },
                    ...(!isReceipt ? { availableCredits: { increment: reservation.amount } } : {}) },
            });
            if (debited.count !== 1) throw new AppError("Reserved balance is inconsistent or available balance would overflow", 409);
            if (courier) {
                const credited = await tx.creditAccount.updateMany({
                    where: { id: courier.id, availableCredits: { lte: 2_147_483_647 - reservation.amount } },
                    data: { availableCredits: { increment: reservation.amount } },
                });
                if (credited.count !== 1) throw new AppError("Courier balance would overflow", 409);
            }
            const rows = courier ? [
                { accountId: requester.id, type: "TRANSFER_SENT" as const, availableDelta: 0, reservedDelta: -reservation.amount },
                { accountId: courier.id, type: "TRANSFER_RECEIVED" as const, availableDelta: reservation.amount, reservedDelta: 0 },
            ] : [
                { accountId: requester.id, type: isRefund ? "REFUND" as const : "RELEASE" as const, availableDelta: reservation.amount, reservedDelta: -reservation.amount },
            ];
            await tx.creditTransaction.createMany({ data: rows.map(row => ({ ...row,
                amount: reservation.amount, orderId: reservation.orderId, reservationId: reservation.id,
                idempotencyKey: `${reservation.id}:${row.type}:${row.accountId}` })) });
            return { reservation: await tx.creditReservation.findUniqueOrThrow({ where: { id: reservation.id } }), applied: true };
        });
    } catch (error) {
        // A reused event ID or ledger key is a conflict, never a successful replay.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new AppError("Settlement event or ledger identity already used", 409);
        }
        throw error;
    }
}
