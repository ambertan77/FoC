// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Reservation setup shared by reservation and settlement integration tests; current setup uses the asynchronous reservation service.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AppError } from "../src/errors/errors.js";
import type { ReservationInput } from "../src/schemas/reservation.schema.js";
import { reservationRequestService } from "../src/services/reservation-request.service.js";
import type { TestContext } from "node:test";
import type { PrismaClient } from "../src/generated/prisma/client.js";

export async function reservationServices(t: TestContext, database: PrismaClient) {
    // Reservation services use a singleton; redirect transactions into this test's isolated schema.
    process.env.DATABASE_URL = process.env.CREDIT_TEST_DATABASE_URL!;
    process.env.PORT = "0";
    process.env.FRONTEND_URL = "http://localhost";
    process.env.JWT_PUBLIC_KEY_PATH = "unused-in-credit-tests.pem";
    process.env.ORDER_CREDIT_SERVICE_TOKEN = "test-token";
    const { prisma } = await import("../src/libs/prisma.js");
    const transaction = prisma.$transaction;
    prisma.$transaction = database.$transaction.bind(database);
    t.after(() => { prisma.$transaction = transaction; });
    const { abortReservation, getReservation } = await import("../src/services/credit.service.js");
    return {
        abortReservation: abortReservation.bind(undefined, database),
        getReservation: getReservation.bind(undefined, database),
        // Keep settlement setup concise while exercising the async reservation decision and outbox.
        async reserveCredits(input: ReservationInput) {
            const request = await reservationRequestService(database, {
                ...input, eventId: randomUUID(), requestType: "CREATE",
            });
            const result = await database.creditOutboxEvent.findUniqueOrThrow({ where: { requestEventId: request.eventId } });
            if (request.outcome === "FAILED") {
                assert.equal(result.eventType, "CREDIT_RESERVATION_FAILED");
                assert.equal(await database.creditReservation.count({ where: { requestEventId: request.eventId } }), 0);
                assert.ok(["CREDIT_ACCOUNT_NOT_FOUND", "INSUFFICIENT_AVAILABLE_CREDITS"].includes(request.failureCode!));
                throw new AppError(request.failureCode!, request.failureCode === "CREDIT_ACCOUNT_NOT_FOUND" ? 404 : 409);
            }
            assert.equal(request.outcome, "SUCCEEDED");
            const reservation = await database.creditReservation.findUniqueOrThrow({ where: { requestEventId: request.eventId } });
            assert.equal(result.eventType, "CREDIT_RESERVATION_SUCCEEDED");
            return { reservation, created: true };
        },
    };
}
