// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Reservation input validation and transfer, release and refund validation tests.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { PrismaClient } from "../src/generated/prisma/client.js";
import { AppError } from "../src/errors/errors.js";
import { reservationSchema } from "../src/schemas/reservation.schema.js";
import { refundCredits, releaseCredits, transferCredits } from "../src/services/settlement.service.js";

const request = { orderId: randomUUID(), requesterId: randomUUID(), amount: 10 };
const event = { ...request, eventId: randomUUID(), reservationId: randomUUID() };
const noDatabase = {
    $transaction: () => { assert.fail("Invalid input must be rejected before accessing the database"); },
} as unknown as PrismaClient;

test("CS F4: reservation input accepts positive integer credits and normalizes UUIDs", () => {
    for (const amount of [1, 2_147_483_647]) {
        assert.deepEqual(reservationSchema.parse({ ...request, requesterId: request.requesterId.toUpperCase(), amount }), { ...request, amount });
    }
});

test("CS F4: reservation input rejects invalid amounts, identities and extra fields", () => {
    for (const change of [
        ...[0, -1, 1.5, 2_147_483_648, "10", null, undefined, NaN, Infinity].map(amount => ({ amount })),
        { orderId: "invalid" }, { requesterId: "invalid" },
        { reservationId: randomUUID() }, { idempotencyKey: "caller-key" },
    ]) {
        assert.equal(reservationSchema.safeParse({ ...request, ...change }).success, false, JSON.stringify(change));
    }
});

for (const [requirement, eventType, settle] of [
    ["CS F5", "ORDER_RECEIVED", transferCredits],
    ["CS F6", "ORDER_CANCELED", releaseCredits],
    ["CS F6", "ORDER_EXPIRED", releaseCredits],
    ["CS F7", "ORDER_FAILED", refundCredits],
] as const) {
    test(`${requirement}: ${eventType} rejects malformed events before database access`, async () => {
        const input = { ...event, eventType, ...(eventType === "ORDER_RECEIVED" ? { courierId: randomUUID() } : {}) };
        for (const change of [
            ...[0, -1, 1.5, 2_147_483_648, "10", undefined].map(amount => ({ amount })),
            { eventId: "invalid" }, { orderId: "invalid" }, { reservationId: "invalid" },
            { requesterId: "invalid" }, { eventType: "ORDER_COMPLETED" }, { extra: true },
            ...(eventType === "ORDER_RECEIVED" ? [{ courierId: undefined }, { courierId: "invalid" }] : [{ courierId: randomUUID() }]),
        ]) {
            await assert.rejects(settle(noDatabase, { ...input, ...change }),
                (error: unknown) => error instanceof AppError && error.statusCode === 400, JSON.stringify(change));
        }
    });
}

test("CS F5: a requester cannot receive their own reserved credits", async () => {
    await assert.rejects(transferCredits(noDatabase, { ...event, eventType: "ORDER_RECEIVED", courierId: request.requesterId.toUpperCase() }),
        (error: unknown) => error instanceof AppError && error.statusCode === 409);
});
