// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-11-04
// Scope: Generated unit test cases for the order and credit services.
// Author review: Reviewed, tested, and edited by Ng See Pui.

import test from "node:test";
import assert from "node:assert/strict";

import {
    requesterOrderHistoryQuerySchema,
    createRequestSchema,
    updateRequestSchema,
    receiveRequestSchema,
    failRequestSchema,
    cancelRequestSchema,
    renewExpiredRequestSchema,
} from "./order.requester.schema.js";

const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const createRequest = {
    name: "  Collect coffee  ",
    description: "  Collect the order from the cafe  ",
    pickupSupplierId: "11111111-1111-4111-8111-111111111111",
    deliverySupplierId: "22222222-2222-4222-8222-222222222222",
    offeredCredits: 10,
    expiryAt: futureExpiry,
};

test("requesterOrderHistoryQuerySchema accepts values and applies defaults", () => {
    const result = requesterOrderHistoryQuerySchema.parse({
        page: "2",
        limit: "20",
    });

    assert.equal(result.page, 2);
    assert.equal(result.limit, 20);
    assert.equal(result.sortBy, "createdAt");
    assert.equal(result.sortOrder, "desc");
});

test("requesterOrderHistoryQuerySchema rejects out-of-range pagination and invalid sort fields", () => {
    assert.equal(
        requesterOrderHistoryQuerySchema.safeParse({ page: "0" }).success,
        false,
    );

    assert.equal(
        requesterOrderHistoryQuerySchema.safeParse({ limit: "101" }).success,
        false,
    );

    assert.equal(
        requesterOrderHistoryQuerySchema.safeParse({ sortBy: "name" }).success,
        false,
    );

    assert.equal(
        requesterOrderHistoryQuerySchema.safeParse({ sortOrder: "test" }).success,
        false,
    );
});

test("createRequestSchema trims text and accepts different locations", () => {
    const result = createRequestSchema.parse(createRequest);

    assert.equal(result.name, "Collect coffee");
    assert.equal(result.description, "Collect the order from the cafe");
    assert.ok(result.expiryAt instanceof Date);
});

test("createRequestSchema rejects the same pickup and delivery location", () => {
    const result = createRequestSchema.safeParse({
        ...createRequest,
        deliverySupplierId: createRequest.pickupSupplierId,
    });

    assert.equal(result.success, false);
});

test("createRequestSchema rejects invalid credits and past expiry", () => {
    assert.equal(
        createRequestSchema.safeParse({
            ...createRequest,
            offeredCredits: 0,
        }).success,
        false,
    );

    assert.equal(
        createRequestSchema.safeParse({
            ...createRequest,
            expiryAt: new Date(Date.now() - 60_000).toISOString(),
        }).success,
        false,
    );
});

test("updateRequestSchema requires a change and expected version", () => {
    assert.equal(
        updateRequestSchema.safeParse({ expectedVersion: 1 }).success,
        false,
    );

    assert.equal(
        updateRequestSchema.safeParse({ name: "Changed name" }).success,
        false,
    );

    assert.equal(
        updateRequestSchema.safeParse({
            expectedVersion: 1,
            name: "test 1",
        }).success,
        true,
    );
});

test("updateRequestSchema does not include offeredCredits in parsed data", () => {
    const result = updateRequestSchema.parse({
        expectedVersion: 1,
        name: "test 1",
        offeredCredits: 999,
    });

    // Zod strips this unknown field because offeredCredits is omitted
    // from the update schema.
    assert.equal("offeredCredits" in result, false);
});

test("receiveRequestSchema requires a positive expected version", () => {
    assert.equal(
        receiveRequestSchema.safeParse({ expectedVersion: 1 }).success,
        true,
    );

    assert.equal(
        receiveRequestSchema.safeParse({ expectedVersion: 0 }).success,
        false,
    );
});

test("failRequestSchema requires a non-empty failure reason", () => {
    assert.equal(
        failRequestSchema.safeParse({
            expectedVersion: 1,
            failureReason: "Wrong item delivered",
        }).success,
        true,
    );

    assert.equal(
        failRequestSchema.safeParse({
            expectedVersion: 1,
            failureReason: "   ",
        }).success,
        false,
    );
});

test("cancelRequestSchema allows an optional reason", () => {
    assert.equal(
        cancelRequestSchema.safeParse({ expectedVersion: 1 }).success,
        true,
    );

    assert.equal(
        cancelRequestSchema.safeParse({
            expectedVersion: 1,
            cancellationReason: "  Changed my mind  ",
        }).success,
        true,
    );
});

test("renewExpiredRequestSchema requires a future expiry and positive expected version", () => {
    assert.equal(
        renewExpiredRequestSchema.safeParse({
            expiryAt: futureExpiry,
            expectedVersion: 1,
        }).success,
        true,
    );

    assert.equal(
        renewExpiredRequestSchema.safeParse({
            expiryAt: new Date(Date.now() - 60_000).toISOString(),
            expectedVersion: 1,
        }).success,
        false,
    );
});