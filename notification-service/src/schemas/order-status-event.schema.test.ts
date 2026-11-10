import test from "node:test";
import assert from "node:assert/strict";
import {
    ORDER_STATUSES,
    orderStatusEventSchema,
} from "./order-status-event.schema.js";

const ids = {
    eventId: "33333333-3333-4333-8333-333333333333",
    orderId: "11111111-1111-4111-8111-111111111111",
    requesterId: "22222222-2222-4222-8222-222222222222",
    courierId: "44444444-4444-4444-8444-444444444444",
};

const validEvent = {
    eventId: ids.eventId,
    eventType: "ORDER_STATUS_CHANGED",
    orderId: ids.orderId,
    orderName: "Buy coffee",
    requesterId: ids.requesterId,
    courierId: ids.courierId,
    fromStatus: "OPEN",
    toStatus: "ACCEPTED",
    version: 2,
    offeredCredits: 10,
    occurredAt: "2026-11-10T00:00:00.000Z",
};

test("orderStatusEventSchema accepts a valid order status event", () => {
    const result = orderStatusEventSchema.safeParse(validEvent);

    assert.equal(result.success, true);
});

test("orderStatusEventSchema accepts a null courier and previous status", () => {
    const result = orderStatusEventSchema.safeParse({
        ...validEvent,
        courierId: null,
        fromStatus: null,
        toStatus: "OPEN",
    });

    assert.equal(result.success, true);
});

test("orderStatusEventSchema accepts every supported order status", () => {
    for (const status of ORDER_STATUSES) {
        const result = orderStatusEventSchema.safeParse({
            ...validEvent,
            fromStatus: status,
            toStatus: status,
        });

        assert.equal(result.success, true, `Expected ${status} to be valid`);
    }
});

test("orderStatusEventSchema allows offeredCredits to be omitted", () => {
    const { offeredCredits: _, ...eventWithoutCredits } = validEvent;

    const result = orderStatusEventSchema.safeParse(eventWithoutCredits);

    assert.equal(result.success, true);
});

test("orderStatusEventSchema normalizes UUIDs to lowercase", () => {
    const result = orderStatusEventSchema.safeParse({
        ...validEvent,
        eventId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        orderId: "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB",
        requesterId: "CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC",
        courierId: "DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD",
    });

    assert.equal(result.success, true);

    if (result.success) {
        assert.equal(
            result.data.eventId,
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        );
        assert.equal(
            result.data.orderId,
            "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        );
        assert.equal(
            result.data.requesterId,
            "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        );
        assert.equal(
            result.data.courierId,
            "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        );
    }
});

test("orderStatusEventSchema rejects an incorrect event type", () => {
    const result = orderStatusEventSchema.safeParse({
        ...validEvent,
        eventType: "ORDER_CREATED",
    });

    assert.equal(result.success, false);
});

test("orderStatusEventSchema rejects malformed UUIDs", () => {
    const result = orderStatusEventSchema.safeParse({
        ...validEvent,
        orderId: "invalid-order-id",
    });

    assert.equal(result.success, false);
});

test("orderStatusEventSchema rejects an empty order name", () => {
    const result = orderStatusEventSchema.safeParse({
        ...validEvent,
        orderName: "",
    });

    assert.equal(result.success, false);
});

test("orderStatusEventSchema rejects an order name longer than 255 characters", () => {
    const result = orderStatusEventSchema.safeParse({
        ...validEvent,
        orderName: "a".repeat(256),
    });

    assert.equal(result.success, false);
});

test("orderStatusEventSchema rejects unsupported statuses", () => {
    const result = orderStatusEventSchema.safeParse({
        ...validEvent,
        toStatus: "UNKNOWN_STATUS",
    });

    assert.equal(result.success, false);
});

test("orderStatusEventSchema rejects non-positive or fractional versions", () => {
    assert.equal(
        orderStatusEventSchema.safeParse({
            ...validEvent,
            version: 0,
        }).success,
        false,
    );

    assert.equal(
        orderStatusEventSchema.safeParse({
            ...validEvent,
            version: 1.5,
        }).success,
        false,
    );
});

test("orderStatusEventSchema rejects negative or fractional offered credits", () => {
    assert.equal(
        orderStatusEventSchema.safeParse({
            ...validEvent,
            offeredCredits: -1,
        }).success,
        false,
    );

    assert.equal(
        orderStatusEventSchema.safeParse({
            ...validEvent,
            offeredCredits: 1.5,
        }).success,
        false,
    );
});

test("orderStatusEventSchema rejects an invalid occurredAt timestamp", () => {
    const result = orderStatusEventSchema.safeParse({
        ...validEvent,
        occurredAt: "not-a-date",
    });

    assert.equal(result.success, false);
});

test("orderStatusEventSchema rejects unknown fields", () => {
    const result = orderStatusEventSchema.safeParse({
        ...validEvent,
        unexpectedField: true,
    });

    assert.equal(result.success, false);
});