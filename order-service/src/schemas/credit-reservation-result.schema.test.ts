import test from "node:test";
import assert from "node:assert/strict";
import { creditReservationResultSchema, reservationRequestPayloadSchema } from "./credit-reservation-result.schema.js";

const ids = {
    eventId: "33333333-3333-4333-8333-333333333333",
    correlationId: "44444444-4444-4444-8444-444444444444",
    orderId: "11111111-1111-4111-8111-111111111111",
    requesterId: "22222222-2222-4222-8222-222222222222",
    reservationId: "55555555-5555-4555-8555-555555555555",
    previousReservationId: "66666666-6666-4666-8666-666666666666",
};

test("creditReservationResultSchema accepts a successful credit reservation result", () => {
    const result = creditReservationResultSchema.safeParse({
        eventId: ids.eventId,
        correlationId: ids.correlationId,
        orderId: ids.orderId,
        requestType: "CREATE",
        reservationId: ids.reservationId,
        eventType: "CREDIT_RESERVATION_SUCCEEDED",
    });

    assert.equal(result.success, true);
});


test("creditReservationResultSchema accepts a failed credit reservation result and trims its reason code", () => {
    const result = creditReservationResultSchema.safeParse({
        eventId: ids.eventId,
        correlationId: ids.correlationId,
        orderId: ids.orderId,
        requestType: "RENEW",
        eventType: "CREDIT_RESERVATION_FAILED",
        reasonCode: "  INSUFFICIENT_CREDITS  ",
    });


    assert.equal(result.success, true);

    if (result.success && result.data.eventType === "CREDIT_RESERVATION_FAILED") {
        assert.equal(result.data.reasonCode, "INSUFFICIENT_CREDITS");
    }
});

test("creditReservationResultSchema rejects a success result without a reservation ID", () => {
    const result = creditReservationResultSchema.safeParse({
        eventId: ids.eventId,
        correlationId: ids.correlationId,
        orderId: ids.orderId,
        requestType: "CREATE",
        eventType: "CREDIT_RESERVATION_SUCCEEDED",
    });

    assert.equal(result.success, false);
});

test("creditReservationResultSchema rejects a failure result without a reason code", () => {
    const result = creditReservationResultSchema.safeParse({
        eventId: ids.eventId,
        correlationId: ids.correlationId,
        orderId: ids.orderId,
        requestType: "CREATE",
        eventType: "CREDIT_RESERVATION_FAILED",
    });

    assert.equal(result.success, false);
});

test("creditReservationResultSchema rejects a blank failure reason code", () => {
    const result = creditReservationResultSchema.safeParse({
        eventId: ids.eventId,
        correlationId: ids.correlationId,
        orderId: ids.orderId,
        requestType: "CREATE",
        eventType: "CREDIT_RESERVATION_FAILED",
        reasonCode: "   ",
    });

    assert.equal(result.success, false);
});

test("creditReservationResultSchema rejects an unsupported result event type", () => {
    const result = creditReservationResultSchema.safeParse({
        eventId: ids.eventId,
        correlationId: ids.correlationId,
        orderId: ids.orderId,
        requestType: "CREATE",
        eventType: "CREDIT_RESERVATION_UNKNOWN",
        reservationId: ids.reservationId,
    });

    assert.equal(result.success, false);
});

test("reservationRequestPayloadSchema accepts a valid CREATE reservation request payload", () => {
    const result = reservationRequestPayloadSchema.safeParse({
        eventId: ids.eventId,
        eventType: "RESERVE_CREDITS",
        requestType: "CREATE",
        orderId: ids.orderId,
        requesterId: ids.requesterId,
        amount: 10,
    });

    assert.equal(result.success, true);
});


test("reservationRequestPayloadSchema accepts a valid RENEW reservation request payload", () => {
    const result = reservationRequestPayloadSchema.safeParse({
        eventId: ids.eventId,
        eventType: "RESERVE_CREDITS",
        requestType: "RENEW",
        orderId: ids.orderId,
        requesterId: ids.requesterId,
        amount: 10,
        previousReservationId: ids.previousReservationId,
        expectedVersion: 2,
        expiryAt: "2026-11-01T10:00:00.000Z",
    });

    assert.equal(result.success, true);
});

test("reservationRequestPayloadSchema rejects a CREATE payload with renewal-only fields", () => {
    const result = reservationRequestPayloadSchema.safeParse({
        eventId: ids.eventId,
        eventType: "RESERVE_CREDITS",
        requestType: "CREATE",
        orderId: ids.orderId,
        requesterId: ids.requesterId,
        amount: 10,
        previousReservationId: ids.previousReservationId,
    });

    assert.equal(result.success, false);
});


test("reservationRequestPayloadSchema rejects a RENEW payload missing required renewal fields", () => {
    const result = reservationRequestPayloadSchema.safeParse({
        eventId: ids.eventId,
        eventType: "RESERVE_CREDITS",
        requestType: "RENEW",
        orderId: ids.orderId,
        requesterId: ids.requesterId,
        amount: 10,
    });

    assert.equal(result.success, false);
});

test("reservationRequestPayloadSchema rejects a request with a non-positive or fractional amount", () => {
    const baseCreateRequest = {
        eventId: ids.eventId,
        eventType: "RESERVE_CREDITS",
        requestType: "CREATE",
        orderId: ids.orderId,
        requesterId: ids.requesterId,
    };

    assert.equal(
        reservationRequestPayloadSchema.safeParse({
            ...baseCreateRequest,
            amount: 0,
        }).success,
        false,
    );

    assert.equal(
        reservationRequestPayloadSchema.safeParse({
            ...baseCreateRequest,
            amount: 1.5,
        }).success,
        false,
    );
});

test("reservationRequestPayloadSchemarejects malformed UUIDs and invalid renewal expiry timestamps", () => {
    assert.equal(
        reservationRequestPayloadSchema.safeParse({
            eventId: "bad-id",
            eventType: "RESERVE_CREDITS",
            requestType: "CREATE",
            orderId: ids.orderId,
            requesterId: ids.requesterId,
            amount: 10,
        }).success,
        false,
    );

    assert.equal(
        reservationRequestPayloadSchema.safeParse({
            eventId: ids.eventId,
            eventType: "RESERVE_CREDITS",
            requestType: "RENEW",
            orderId: ids.orderId,
            requesterId: ids.requesterId,
            amount: 10,
            previousReservationId: ids.previousReservationId,
            expectedVersion: 3,
            expiryAt: "not-a-date",
        }).success,
        false,
    );
});

test("creditReservationResultSchema normalizes UUIDs to lowercase", () => {
    const uppercaseId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";

    const result = creditReservationResultSchema.safeParse({
        eventId: uppercaseId,
        correlationId: ids.correlationId,
        orderId: ids.orderId,
        requestType: "CREATE",
        eventType: "CREDIT_RESERVATION_SUCCEEDED",
        reservationId: ids.reservationId,
    });

    assert.equal(result.success, true);

    if (result.success) {
        assert.equal(result.data.eventId, uppercaseId.toLowerCase());
    }
});