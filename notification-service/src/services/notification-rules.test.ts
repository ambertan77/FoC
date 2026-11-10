import test from "node:test";
import assert from "node:assert/strict";

import {
    draftsFor,
    type Draft,
} from "./notification-rules.js";
import type { OrderStatusEvent } from "../schemas/order-status-event.schema.js";

const event = (
    overrides: Partial<OrderStatusEvent> = {},
): OrderStatusEvent => ({
    eventId: "33333333-3333-4333-8333-333333333333",
    eventType: "ORDER_STATUS_CHANGED",
    orderId: "11111111-1111-4111-8111-111111111111",
    orderName: "Buy coffee",
    requesterId: "22222222-2222-4222-8222-222222222222",
    courierId: "44444444-4444-4444-8444-444444444444",
    fromStatus: "OPEN",
    toStatus: "ACCEPTED",
    version: 2,
    offeredCredits: 10,
    occurredAt: "2026-11-10T00:00:00.000Z",
    ...overrides,
});

const assertDraft = (
    actual: Draft[],
    expected: Draft[],
) => {
    assert.deepEqual(actual, expected);
};

test("notifies requester when an order becomes open", () => {
    const result = draftsFor(event({
        fromStatus: "ACCEPTED",
        toStatus: "OPEN",
    }));

    assertDraft(result, [{
        userId: event().requesterId,
        title: "Courier dropped your request",
        body: '"Buy coffee" is open again for couriers.',
    }]);
});

test("notifies requester when an order is initially opened", () => {
    const result = draftsFor(event({
        fromStatus: null,
        toStatus: "OPEN",
    }));

    assertDraft(result, [{
        userId: event().requesterId,
        title: "Your request is live",
        body: '"Buy coffee" is now open for couriers.',
    }]);
});

test("notifies requester when a courier accepts the order", () => {
    const result = draftsFor(event({
        toStatus: "ACCEPTED",
    }));

    assertDraft(result, [{
        userId: event().requesterId,
        title: "A courier accepted your request",
        body: '"Buy coffee" has a courier.',
    }]);
});

test("notifies requester when the order is picked up", () => {
    const result = draftsFor(event({
        fromStatus: "ACCEPTED",
        toStatus: "PICKED_UP",
    }));

    assertDraft(result, [{
        userId: event().requesterId,
        title: "Item picked up",
        body: 'Your courier picked up "Buy coffee".',
    }]);
});

test("notifies requester when the order is completed", () => {
    const result = draftsFor(event({
        fromStatus: "PICKED_UP",
        toStatus: "COMPLETED",
    }));

    assertDraft(result, [{
        userId: event().requesterId,
        title: "Delivered",
        body: '"Buy coffee" was delivered. Please confirm receipt.',
    }]);
});

test("notifies courier when the requester receives the order", () => {
    const result = draftsFor(event({
        fromStatus: "COMPLETED",
        toStatus: "RECEIVED",
    }));

    assertDraft(result, [{
        userId: event().courierId!,
        title: "Request received",
        body: '"Buy coffee" was received.',
    }]);
});

test("notifies requester and courier for automatic receipt", () => {
    const result = draftsFor(event({
        fromStatus: "COMPLETED",
        toStatus: "AUTO_RECEIVED",
    }));

    assertDraft(result, [
        {
            userId: event().requesterId,
            title: "Request auto received",
            body: '"Buy coffee" was received.',
        },
        {
            userId: event().courierId!,
            title: "Request auto received",
            body: '"Buy coffee" was received.',
        },
    ]);
});

test("notifies requester when the order expires", () => {
    const result = draftsFor(event({
        fromStatus: "OPEN",
        toStatus: "EXPIRED",
    }));

    assertDraft(result, [{
        userId: event().requesterId,
        title: "Request expired",
        body: 'Nobody accepted "Buy coffee" in time. You can renew it.',
    }]);
});

test("notifies requester when the order is canceled", () => {
    const result = draftsFor(event({
        fromStatus: "OPEN",
        toStatus: "CANCELED",
    }));

    assertDraft(result, [{
        userId: event().requesterId,
        title: "Request expired",
        body: 'Nobody accepted "Buy coffee" in time. You can renew it.',
    }]);
});

test("notifies requester and courier when completion fails automatically", () => {
    const result = draftsFor(event({
        fromStatus: "PICKED_UP",
        toStatus: "AUTO_FAILED",
    }));

    assertDraft(result, [
        {
            userId: event().requesterId,
            title: "Completion deadline missed",
            body: '"Buy coffee" failed.',
        },
        {
            userId: event().courierId!,
            title: "Completion deadline missed",
            body: '"Buy coffee" was not completed in time.',
        },
    ]);
});

test("notifies courier when the requester reports a failed delivery", () => {
    const result = draftsFor(event({
        fromStatus: "COMPLETED",
        toStatus: "FAILED",
    }));

    assertDraft(result, [{
        userId: event().courierId!,
        title: "Delivery reported as failed",
        body: 'The requester reported "Buy coffee" as failed.',
    }]);
});

test("does not notify anyone for a pending reservation", () => {
    const result = draftsFor(event({
        fromStatus: null,
        toStatus: "PENDING_RESERVATION",
    }));

    assert.deepEqual(result, []);
});

test("does not notify a missing courier", () => {
    const result = draftsFor(event({
        courierId: null,
        fromStatus: "COMPLETED",
        toStatus: "RECEIVED",
    }));

    assert.deepEqual(result, []);
});

test("uses the order name in notification messages", () => {
    const result = draftsFor(event({
        orderName: "Pick up medicine",
        toStatus: "COMPLETED",
    }));

    assert.equal(result[0]?.body, '"Pick up medicine" was delivered. Please confirm receipt.');
});