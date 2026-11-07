import test from "node:test";
import assert from "node:assert/strict";
import { reservationRequestEventSchema } from "./reservation-request-event.schema.js";

const common = {
    eventId: "33333333-3333-4333-8333-333333333333",
    eventType: "RESERVE_CREDITS",
    orderId: "11111111-1111-4111-8111-111111111111",
    requesterId: "22222222-2222-4222-8222-222222222222",
    amount: 10,
};

test("reservationRequestEventSchema accepts a valid CREATE request", () => {
    const result = reservationRequestEventSchema.safeParse({
        ...common,
        requestType: "CREATE",
    });

    assert.equal(result.success, true);
});


test("reservationRequestEventSchema accepts a valid RENEW request", () => {
    const result = reservationRequestEventSchema.safeParse({
        ...common,
        requestType: "RENEW",
        previousReservationId: "55555555-5555-4555-8555-555555555555",
        expectedVersion: 3,
        expiryAt: "2026-11-01T10:00:00.000Z",
    });

    assert.equal(result.success, true);
});

test("reservationRequestEventSchema rejects RENEW without previousReservationId", () => {
    const result = reservationRequestEventSchema.safeParse({
        ...common,
        requestType: "RENEW",
        expectedVersion: 3,
        expiryAt: "2026-11-01T10:00:00.000Z",
    });

    assert.equal(result.success, false);
});

test("reservationRequestEventSchema rejects RENEW without expectedVersion or expiryAt", () => {
    const result = reservationRequestEventSchema.safeParse({
        ...common,
        requestType: "RENEW",
        previousReservationId: "55555555-5555-4555-8555-555555555555",
    });

    assert.equal(result.success, false);
});

test("reservationRequestEventSchema rejects renewal-only fields on CREATE", () => {
    const result = reservationRequestEventSchema.safeParse({
        ...common,
        requestType: "CREATE",
        previousReservationId: "55555555-5555-4555-8555-555555555555",
    });

    assert.equal(result.success, false);
});

test("reservationRequestEventSchema rejects an invalid amount", () => {
    const result = reservationRequestEventSchema.safeParse({
        ...common,
        requestType: "CREATE",
        amount: 0,
    });

    assert.equal(result.success, false);
});

test("reservationRequestEventSchema rejects malformed IDs", () => {
    const result = reservationRequestEventSchema.safeParse({
        ...common,
        requestType: "CREATE",
        orderId: "not-a-uuid",
    });

    assert.equal(result.success, false);
});

test("reservationRequestEventSchema rejects unknown fields", () => {
    const result = reservationRequestEventSchema.safeParse({
        ...common,
        requestType: "CREATE",
        unexpected: true,
    });

    assert.equal(result.success, false);
});