import test from "node:test";
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";

import { prisma as sharedPrisma } from "../libs/prisma.js";
import { AppError } from "../errors/errors.js";
import {
    OrderEventType,
    OrderStatus,
} from "../generated/prisma/client.js";
import { updateExpiredOrders } from "./order-expiry.service.js";

const openOrder = {
    id: "order-open",
    requesterId: "requester-1",
    courierId: null,
    status: OrderStatus.OPEN,
    version: 1,
    offeredCredits: 10,
    creditReservationId: "reservation-open",
};

const acceptedOrder = {
    id: "order-accepted",
    requesterId: "requester-2",
    courierId: "courier-1",
    status: OrderStatus.ACCEPTED,
    version: 3,
    offeredCredits: 20,
    creditReservationId: "reservation-accepted",
};

const pickedUpOrder = {
    id: "order-picked-up",
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
    assert.equal(outboxEvent.create.mock.calls.length, 1);

    const historyArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(orderStatusHistory.create.mock.calls);

    assert.equal(historyArgs.data.fromStatus, OrderStatus.ACCEPTED);
    assert.equal(historyArgs.data.toStatus, OrderStatus.AUTO_FAILED);

    const outboxArgs = firstArgument<{
        data: {
            eventType: OrderEventType;
        };
    }>(outboxEvent.create.mock.calls);

    assert.equal(
        outboxArgs.data.eventType,
        OrderEventType.ORDER_FAILED,
    );
});

test("updateExpiredOrders fails a picked-up order", async (t) => {
    const { order } = useMockPrisma(t, {
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
    assert.equal(outboxEvent.create.mock.calls.length, 3);
});