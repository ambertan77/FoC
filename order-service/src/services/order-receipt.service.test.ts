// AI Assistance Disclosure:
// Tool: Claude Code (Opus 5.5)
// Date: 2026-11-05
// Scope: Generated boilerplate code for test cases checking if the function in order-receipt.service.ts runs successfully.
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import test from "node:test";
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";
import { prisma as sharedPrisma } from "../libs/prisma.js";
import { updateOrdersAsReceived } from "./order-receipt.service.js";
import { AppError } from "../errors/errors.js";

const now: Date = new Date();

const MOCK_COMPLETED_ORDER_1 = {
    id: "order_1",
    requesterId: "stu_1",
    courierId: "stu_2",
    name: "buy coffee",
    description: "1 iced latte, less sugar",
    pickupSupplierId: "sup_1",
    deliverySupplierId: "sup_2",
    offeredCredits: 5,
    remarks: null,
    status: "COMPLETED",
    expiryAt: new Date(now.getTime() + 60 * 60 * 1000), // expires 1 hour from now
    version: 1,
    createdAt: now,
    updatedAt: now,
    acceptedAt: new Date(),
    pickedUpAt: new Date(),
    completedAt: new Date(),
    receivedAt: null,
    canceledAt: null,
    expiredAt: null,
    failedAt: null,
    cancellationReason: null,
    failureReason: null,
    creditReservationId: "cr1",
};

const MOCK_COMPLETED_ORDER_2 = { ...MOCK_COMPLETED_ORDER_1, id: "order_2", requesterId: "stu_3", courierId: "stu_4", creditReservationId: "cr2" };

interface MockConfig {
    findManyReturn?: unknown[] | null;
    updateManyReturn?: unknown;
    orderStatusHistoryCreateReturn?: unknown | null;
    outboxEventCreateReturn?: unknown | null;
}

function createMockPrisma(config: MockConfig = {}) {
    const calls = {
        findMany: 0,
        updateMany: 0,
        orderStatusHistoryCreate: 0,
        outboxEventCreate: 0,
        transaction: 0
    };

    const captured = {
        findManyArgs: undefined as unknown,
        updateManyArgs: undefined as unknown,
        orderStatusHistoryCreateArgs: undefined as unknown,
        outboxEventCreateArgs: undefined as unknown,
    };

    const prisma = {
        order: {
            findMany: mock.fn(async (args: unknown) => {
                calls.findMany++;
                captured.findManyArgs = args;
                return "findManyReturn" in config ? config.findManyReturn : []; // allow null to be returned
            }),
            updateMany: mock.fn(async (args: unknown) => {
                calls.updateMany++;
                captured.updateManyArgs = args;
                return config.updateManyReturn ?? { count: 1 }; // default to a successful update of one row
            })
        },
        orderStatusHistory: {
            create: mock.fn(async (args: unknown) => {
                calls.orderStatusHistoryCreate++;
                captured.orderStatusHistoryCreateArgs = args;
                return "orderStatusHistoryCreateReturn" in config ? config.orderStatusHistoryCreateReturn : {}; // allow null to be returned
            }),
        },
        outboxEvent: {
            create: mock.fn(async (args: unknown) => {
                calls.outboxEventCreate++;
                captured.outboxEventCreateArgs = args;
                return "outboxEventCreateReturn" in config ? config.outboxEventCreateReturn : {}; // allow null to be returned
            }),
        },
        // run the transaction callback with the mock client as tx, so tx.order, tx.orderStatusHistory and tx.outboxEvent use the mock tables
        $transaction: mock.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
            calls.transaction++;
            return callback(prisma);
        }),
    };

    return { prisma, calls, captured };
}

// use the mock order, orderStatusHistory and outboxEvent tables and $transaction when running the test, instead of the actual shared prisma client
function useSharedMockPrisma(t: TestContext, config: MockConfig = {}) {
    const mocked = createMockPrisma(config); // build a mock prisma client
    const originalOrder = sharedPrisma.order;
    const originalOrderStatusHistory = sharedPrisma.orderStatusHistory;
    const originalOutboxEvent = sharedPrisma.outboxEvent;
    const originalTransaction = sharedPrisma.$transaction;

    // point sharedPrisma.order to the mock db so that tested functions query/write to the fake order table, instead of the real database
    Object.defineProperty(sharedPrisma, "order", {
        value: mocked.prisma.order,
        configurable: true, // allows the property to be redefined again in t.after below
        writable: true,
    });

    // point sharedPrisma.orderStatusHistory to the mock db
    Object.defineProperty(sharedPrisma, "orderStatusHistory", {
        value: mocked.prisma.orderStatusHistory,
        configurable: true, // allows the property to be redefined again in t.after below
        writable: true,
    });

    // point sharedPrisma.outboxEvent to the mock db
    Object.defineProperty(sharedPrisma, "outboxEvent", {
        value: mocked.prisma.outboxEvent,
        configurable: true, // allows the property to be redefined again in t.after below
        writable: true,
    });

    // point sharedPrisma.$transaction to the mock so the transaction callback runs against the mock tables
    Object.defineProperty(sharedPrisma, "$transaction", {
        value: mocked.prisma.$transaction,
        configurable: true, // allows the property to be redefined again in t.after below
        writable: true,
    });

    // always put the real tables and $transaction back after a test ends, even if an assertion fails
    t.after(() => {
        Object.defineProperty(sharedPrisma, "order", {
            value: originalOrder,
            configurable: true,
            writable: true,
        });

        Object.defineProperty(sharedPrisma, "orderStatusHistory", {
            value: originalOrderStatusHistory,
            configurable: true,
            writable: true,
        });

        Object.defineProperty(sharedPrisma, "outboxEvent", {
            value: originalOutboxEvent,
            configurable: true,
            writable: true,
        });

        Object.defineProperty(sharedPrisma, "$transaction", {
            value: originalTransaction,
            configurable: true,
            writable: true,
        });
    });

    return mocked;
}

test("updateOrdersAsReceived does no updates when there are no orders that satisfy the auto-receival criteria", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findManyReturn: [] }); // no orders that satisfy the WHERE clause returned

    const result = await updateOrdersAsReceived();

    // check result
    assert.equal(result, 0);

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.updateMany, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
    assert.equal(calls.outboxEventCreate, 0);
});

// test("updateOrdersAsReceived only finds orders marked as COMPLETED more than 30 mins ago", async (t) => {
//     // this test case checks arguments passed into the WHERE clause of the findMany query
//     const { captured } = useSharedMockPrisma(t, { findManyReturn: [] });




// });

test("updateOrdersAsReceived returns error code 409 and skips the transaction when an order has no credit reservation", async (t) => {
    const mockOrderWithNoReservation = { ...MOCK_COMPLETED_ORDER_1, creditReservationId: null };
    const { calls } = useSharedMockPrisma(t, { findManyReturn: [mockOrderWithNoReservation] });

    await assert.rejects(
        () => updateOrdersAsReceived(),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, "CONFLICT");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.updateMany, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
    assert.equal(calls.outboxEventCreate, 0);
});

test("updateOrdersAsReceived skips the status history and outbox event when no update to the order was made", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findManyReturn: [MOCK_COMPLETED_ORDER_1],
        updateManyReturn: { count: 0 }, // no rows in order table updated
    });

    const result = await updateOrdersAsReceived();

    // check result
    assert.equal(result, 0);

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.updateMany, 1);
    assert.equal(calls.orderStatusHistoryCreate, 0);
    assert.equal(calls.outboxEventCreate, 0);
});

test("updateOrdersAsReceived executes successfully for each valid completed order", async (t) => {
    const orders = [MOCK_COMPLETED_ORDER_1, MOCK_COMPLETED_ORDER_2];

    const { calls, captured, prisma } = useSharedMockPrisma(t, { findManyReturn: orders });

    const before = (new Date()).getTime();
    const result = await updateOrdersAsReceived();
    const after = (new Date()).getTime();

    // check arguments passed into prisma findMany query
    const findManyArgs = captured.findManyArgs as { where: Record<string, unknown>; select: Record<string, boolean> };
    assert.equal(findManyArgs.where.status, "COMPLETED");
    // check cutoff time 
    const cutoff = (findManyArgs.where.completedAt as { lte: Date }).lte;
    assert.ok(cutoff instanceof Date);
    // we cannot determine the exact cutoff time passed into the prisma query
    // cutoff time must be between before the time of function call and after the time of function call, -30 minutes
    assert.ok(cutoff.getTime() >= before - 30 * 60 * 1000); // cutoff is 30 minutes before the time of the call
    assert.ok(cutoff.getTime() <= after - 30 * 60 * 1000);
    assert.deepEqual(findManyArgs.select, {
        id: true,
        name: true,
        requesterId: true,
        courierId: true,
        status: true,
        version: true,
        offeredCredits: true,
        creditReservationId: true,
    });

    // check each update, order status history and outbox event for each order returned by findMany
    orders.forEach((order, i) => {
        const orderStatusChange = {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: "AUTO_RECEIVED",
            changedBy: null, // system update
            reason: "Requester did not receive the order before timeout, thus an automatic system update was applied.",
        };

        // check arguments passed into prisma updateMany
        const updateManyArgs = prisma.order.updateMany.mock.calls[i]!.arguments[0] as { where: Record<string, unknown>; data: Record<string, unknown> };
        assert.equal(updateManyArgs.where.id, order.id);
        assert.equal(updateManyArgs.where.status, "COMPLETED");
        assert.equal(updateManyArgs.where.version, order.version);
        assert.ok((updateManyArgs.where.completedAt as { lte: Date }).lte instanceof Date);
        assert.equal(updateManyArgs.data.status, "AUTO_RECEIVED");
        assert.deepEqual(updateManyArgs.data.version, { increment: 1 });

        // check arguments passed into prisma when creating orderStatusHistory row
        assert.deepEqual(prisma.orderStatusHistory.create.mock.calls[i]!.arguments[0], { data: orderStatusChange });

        // check arguments passed into prisma when creating outboxEvent row
        const outboxEvents = prisma.outboxEvent.create.mock.calls
            .map((call) => (call.arguments[0] as {
                data: {
                    id: string;
                    orderId: string;
                    eventType: string;
                    payload: Record<string, unknown>;
                };
            }).data)
            .filter((event) => event.orderId === order.id);

        assert.equal(outboxEvents.length, 2);

        const receivedEvent = outboxEvents.find(
            (event) => event.eventType === "ORDER_RECEIVED",
        );

        assert.ok(receivedEvent);
        assert.equal(receivedEvent.payload.eventType, "ORDER_RECEIVED");
        assert.equal(receivedEvent.payload.reservationId, order.creditReservationId);
        assert.equal(receivedEvent.payload.orderId, order.id);
        assert.equal(receivedEvent.payload.requesterId, order.requesterId);
        assert.equal(receivedEvent.payload.courierId, order.courierId);
        assert.equal(receivedEvent.payload.amount, order.offeredCredits);

        const statusEvent = outboxEvents.find(
            (event) => event.eventType === "ORDER_STATUS_CHANGED",
        );

        assert.ok(statusEvent);
        assert.equal(statusEvent.payload.eventType, "ORDER_STATUS_CHANGED");
        assert.equal(statusEvent.payload.orderId, order.id);
        assert.equal(statusEvent.payload.orderName, order.name);
        assert.equal(statusEvent.payload.requesterId, order.requesterId);
        assert.equal(statusEvent.payload.courierId, order.courierId);
        assert.equal(statusEvent.payload.fromStatus, "COMPLETED");
        assert.equal(statusEvent.payload.toStatus, "AUTO_RECEIVED");
        assert.equal(statusEvent.payload.version, order.version + 1);
        assert.equal(statusEvent.payload.offeredCredits, order.offeredCredits);
        assert.equal(typeof statusEvent.payload.eventId, "string");
        assert.equal(typeof statusEvent.payload.occurredAt, "string");
    });

    // check result
    assert.equal(result, orders.length);

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.transaction, orders.length);
    assert.equal(calls.updateMany, orders.length);
    assert.equal(calls.orderStatusHistoryCreate, orders.length);
    assert.equal(calls.outboxEventCreate, orders.length * 2);
});
