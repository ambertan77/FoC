import test from "node:test";
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";

import { prisma as sharedPrisma } from "../libs/prisma.js";
import {
    OrderEventType,
    OrderStatus,
} from "../generated/prisma/client.js";
import { updateExpiredOrders } from "./order-expiry.service.js";

const openOrder = {
    id: "order-open",
    name: "Open order",
    requesterId: "requester-1",
    courierId: null,
    status: OrderStatus.OPEN,
    version: 1,
    offeredCredits: 10,
    creditReservationId: "reservation-open",
};

const acceptedOrder = {
    id: "order-accepted",
    name: "Accepted order",
    requesterId: "requester-2",
    courierId: "courier-1",
    status: OrderStatus.ACCEPTED,
    version: 3,
    offeredCredits: 20,
    creditReservationId: "reservation-accepted",
};

const pickedUpOrder = {
    id: "order-picked-up",
    name: "Picked up order",
    requesterId: "requester-3",
    courierId: "courier-2",
    status: OrderStatus.PICKED_UP,
    version: 4,
    offeredCredits: 30,
    creditReservationId: "reservation-picked-up",
};

type MockConfig = {
    candidateOrders?: unknown[];
    updateCounts?: number[];
};

type MockCall = {
    arguments: readonly unknown[];
};

function firstArgument<T>(calls: readonly MockCall[]): T {
    const call = calls[0];
    assert.ok(call, "Expected mock to have been called");

    const argument = call.arguments[0];
    assert.ok(argument, "Expected mock argument");

    return argument as T;
}

function statusEventFrom(
    calls: readonly MockCall[],
): {
    eventType: string;
    payload: Record<string, unknown>;
} {
    const event = calls
        .map((call) => {
            const args = call.arguments[0] as {
                data: {
                    eventType: string;
                    payload: Record<string, unknown>;
                };
            };

            return args.data;
        })
        .find((eventData) => eventData.eventType === "ORDER_STATUS_CHANGED");

    assert.ok(event, "Expected ORDER_STATUS_CHANGED outbox event");
    return event;
}

function createMockPrisma(config: MockConfig = {}) {
    let updateIndex = 0;

    const order = {
        findMany: mock.fn(async (_args: unknown) =>
            config.candidateOrders ?? [],
        ),

        updateMany: mock.fn(async (_args: unknown) => {
            const count =
                config.updateCounts?.[updateIndex++] ?? 1;

            return { count };
        }),
    };

    const orderStatusHistory = {
        create: mock.fn(async (_args: unknown) => ({})),
    };

    const outboxEvent = {
        create: mock.fn(async (_args: unknown) => ({})),
    };

    const prisma = {
        order,
        orderStatusHistory,
        outboxEvent,
        $transaction: mock.fn(
            async (
                callback: (tx: typeof prisma) => Promise<unknown>,
            ) => callback(prisma),
        ),
    };

    return {
        prisma,
        order,
        orderStatusHistory,
        outboxEvent,
    };
}

function useMockPrisma(
    t: TestContext,
    config: MockConfig = {},
) {
    const mocked = createMockPrisma(config);

    const original = {
        order: sharedPrisma.order,
        orderStatusHistory: sharedPrisma.orderStatusHistory,
        outboxEvent: sharedPrisma.outboxEvent,
        transaction: sharedPrisma.$transaction,
    };

    Object.defineProperty(sharedPrisma, "order", {
        value: mocked.order,
        configurable: true,
    });

    Object.defineProperty(sharedPrisma, "orderStatusHistory", {
        value: mocked.orderStatusHistory,
        configurable: true,
    });

    Object.defineProperty(sharedPrisma, "outboxEvent", {
        value: mocked.outboxEvent,
        configurable: true,
    });

    Object.defineProperty(sharedPrisma, "$transaction", {
        value: mocked.prisma.$transaction,
        configurable: true,
    });

    t.after(() => {
        Object.defineProperty(sharedPrisma, "order", {
            value: original.order,
            configurable: true,
        });

        Object.defineProperty(sharedPrisma, "orderStatusHistory", {
            value: original.orderStatusHistory,
            configurable: true,
        });

        Object.defineProperty(sharedPrisma, "outboxEvent", {
            value: original.outboxEvent,
            configurable: true,
        });

        Object.defineProperty(sharedPrisma, "$transaction", {
            value: original.transaction,
            configurable: true,
        });
    });

    return mocked;
}

test("updateExpiredOrders returns zero when there are no expired orders", async (t) => {
    const { order, orderStatusHistory, outboxEvent } = useMockPrisma(t, {
        candidateOrders: [],
    });

    const result = await updateExpiredOrders();

    assert.equal(result, 0);
    assert.equal(order.updateMany.mock.calls.length, 0);
    assert.equal(orderStatusHistory.create.mock.calls.length, 0);
    assert.equal(outboxEvent.create.mock.calls.length, 0);
});

test("updateExpiredOrders expires an open order without a courier", async (t) => {
    const { order, orderStatusHistory, outboxEvent } = useMockPrisma(t, {
        candidateOrders: [openOrder],
    });

    const result = await updateExpiredOrders();

    assert.equal(result, 1);

    const updateArgs = firstArgument<{
        where: Record<string, unknown>;
        data: Record<string, unknown>;
    }>(order.updateMany.mock.calls);

    assert.equal(updateArgs.where.id, openOrder.id);
    assert.equal(updateArgs.where.status, OrderStatus.OPEN);
    assert.equal(updateArgs.where.version, openOrder.version);

    const expiryFilter = updateArgs.where.expiryAt as {
        lte: unknown;
    };

    assert.ok(expiryFilter.lte instanceof Date);

    assert.equal(updateArgs.data.status, OrderStatus.EXPIRED);
    assert.deepEqual(updateArgs.data.version, { increment: 1 });

    const expiredAt = updateArgs.data.expiredAt;
    assert.ok(expiredAt instanceof Date);

    const historyArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(orderStatusHistory.create.mock.calls);

    assert.deepEqual(historyArgs.data, {
        orderId: openOrder.id,
        fromStatus: OrderStatus.OPEN,
        toStatus: OrderStatus.EXPIRED,
        changedBy: null,
        reason: "No courier accepted the request before its completion deadline.",
    });

    const outboxArgs = firstArgument<{
        data: {
            id: string;
            orderId: string;
            eventType: OrderEventType;
            payload: Record<string, unknown>;
        };
    }>(outboxEvent.create.mock.calls);

    assert.equal(typeof outboxArgs.data.id, "string");
    assert.equal(outboxArgs.data.orderId, openOrder.id);
    assert.equal(outboxArgs.data.eventType, OrderEventType.ORDER_EXPIRED);
    assert.deepEqual(outboxArgs.data.payload, {
        eventId: outboxArgs.data.id,
        eventType: OrderEventType.ORDER_EXPIRED,
        reservationId: openOrder.creditReservationId,
        orderId: openOrder.id,
        requesterId: openOrder.requesterId,
        amount: openOrder.offeredCredits,
    });

    assert.equal(outboxEvent.create.mock.calls.length, 2);

    const statusEvent = statusEventFrom(outboxEvent.create.mock.calls);

    assert.equal(statusEvent.payload.orderId, openOrder.id);
    assert.equal(statusEvent.payload.orderName, openOrder.name);
    assert.equal(statusEvent.payload.requesterId, openOrder.requesterId);
    assert.equal(statusEvent.payload.courierId, openOrder.courierId);
    assert.equal(statusEvent.payload.fromStatus, OrderStatus.OPEN);
    assert.equal(statusEvent.payload.toStatus, OrderStatus.EXPIRED);
    assert.equal(statusEvent.payload.version, openOrder.version + 1);
    assert.equal(statusEvent.payload.offeredCredits, openOrder.offeredCredits);
    assert.equal(statusEvent.payload.eventType, "ORDER_STATUS_CHANGED");
    assert.equal(typeof statusEvent.payload.eventId, "string");
    assert.equal(typeof statusEvent.payload.occurredAt, "string");
});

test("updateExpiredOrders fails an accepted order", async (t) => {
    const { order, orderStatusHistory, outboxEvent } = useMockPrisma(t, {
        candidateOrders: [acceptedOrder],
    });

    const result = await updateExpiredOrders();

    assert.equal(result, 1);

    const updateArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(order.updateMany.mock.calls);

    assert.equal(updateArgs.data.status, OrderStatus.AUTO_FAILED);
    assert.deepEqual(updateArgs.data.version, { increment: 1 });
    assert.equal(
        updateArgs.data.failureReason,
        "The courier did not complete the delivery before the request completion deadline.",
    );

    assert.ok(updateArgs.data.failedAt instanceof Date);
    assert.equal(orderStatusHistory.create.mock.calls.length, 1);

    const historyArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(orderStatusHistory.create.mock.calls);

    assert.equal(historyArgs.data.fromStatus, OrderStatus.ACCEPTED);
    assert.equal(historyArgs.data.toStatus, OrderStatus.AUTO_FAILED);

    const creditEvent = outboxEvent.create.mock.calls[0]!.arguments[0] as {
        data: {
            eventType: OrderEventType;
        };
    };

    assert.equal(creditEvent.data.eventType, OrderEventType.ORDER_FAILED);

    assert.equal(outboxEvent.create.mock.calls.length, 2);

    const statusEvent = statusEventFrom(outboxEvent.create.mock.calls);

    assert.equal(statusEvent.payload.orderId, acceptedOrder.id);
    assert.equal(statusEvent.payload.orderName, acceptedOrder.name);
    assert.equal(statusEvent.payload.requesterId, acceptedOrder.requesterId);
    assert.equal(statusEvent.payload.courierId, acceptedOrder.courierId);
    assert.equal(statusEvent.payload.fromStatus, OrderStatus.ACCEPTED);
    assert.equal(statusEvent.payload.toStatus, OrderStatus.AUTO_FAILED);
    assert.equal(statusEvent.payload.version, acceptedOrder.version + 1);
    assert.equal(statusEvent.payload.offeredCredits, acceptedOrder.offeredCredits);
});

test("updateExpiredOrders fails a picked-up order", async (t) => {
    const { order, orderStatusHistory, outboxEvent } = useMockPrisma(t, {
        candidateOrders: [pickedUpOrder],
    });

    const result = await updateExpiredOrders();

    assert.equal(result, 1);

    const updateArgs = firstArgument<{
        where: Record<string, unknown>;
        data: Record<string, unknown>;
    }>(order.updateMany.mock.calls);

    assert.equal(updateArgs.where.status, OrderStatus.PICKED_UP);
    assert.equal(updateArgs.data.status, OrderStatus.AUTO_FAILED);
    assert.ok(updateArgs.data.failedAt instanceof Date);
    assert.equal(orderStatusHistory.create.mock.calls.length, 1);
    assert.equal(outboxEvent.create.mock.calls.length, 2);

    const statusEvent = statusEventFrom(outboxEvent.create.mock.calls);

    assert.equal(statusEvent.payload.orderId, pickedUpOrder.id);
    assert.equal(statusEvent.payload.fromStatus, OrderStatus.PICKED_UP);
    assert.equal(statusEvent.payload.toStatus, OrderStatus.AUTO_FAILED);
    assert.equal(statusEvent.payload.version, pickedUpOrder.version + 1);
});

test("updateExpiredOrders skips an order changed concurrently", async (t) => {
    const { order, orderStatusHistory, outboxEvent } = useMockPrisma(t, {
        candidateOrders: [openOrder],
        updateCounts: [0],
    });

    const result = await updateExpiredOrders();

    assert.equal(result, 0);
    assert.equal(order.updateMany.mock.calls.length, 1);
    assert.equal(orderStatusHistory.create.mock.calls.length, 0);
    assert.equal(outboxEvent.create.mock.calls.length, 0);
});

test("updateExpiredOrders processes multiple expired orders", async (t) => {
    const { order, orderStatusHistory, outboxEvent } = useMockPrisma(t, {
        candidateOrders: [
            openOrder,
            acceptedOrder,
            pickedUpOrder,
        ],
    });

    const result = await updateExpiredOrders();

    assert.equal(result, 3);
    assert.equal(order.updateMany.mock.calls.length, 3);
    assert.equal(orderStatusHistory.create.mock.calls.length, 3);
    assert.equal(outboxEvent.create.mock.calls.length, 6);
    
    const statusEvents = outboxEvent.create.mock.calls
        .map((call) => {
            const args = call.arguments[0] as {
                data: {
                    eventType: string;
                    payload: Record<string, unknown>;
                };
            };

            return args.data;
        })
        .filter((event) => event.eventType === "ORDER_STATUS_CHANGED");

    assert.equal(statusEvents.length, 3);

    assert.deepEqual(
        statusEvents.map((event) => ({
            orderId: event.payload.orderId,
            fromStatus: event.payload.fromStatus,
            toStatus: event.payload.toStatus,
        })),
        [
            {
                orderId: openOrder.id,
                fromStatus: OrderStatus.OPEN,
                toStatus: OrderStatus.EXPIRED,
            },
            {
                orderId: acceptedOrder.id,
                fromStatus: OrderStatus.ACCEPTED,
                toStatus: OrderStatus.AUTO_FAILED,
            },
            {
                orderId: pickedUpOrder.id,
                fromStatus: OrderStatus.PICKED_UP,
                toStatus: OrderStatus.AUTO_FAILED,
            },
        ],
    );
});