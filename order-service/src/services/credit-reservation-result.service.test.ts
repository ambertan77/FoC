import test from "node:test";
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";

import { prisma as sharedPrisma } from "../libs/prisma.js";
import { AppError } from "../errors/errors.js";
import {
    OrderEventType,
    OrderStatus,
    CreditReservationResultType,
} from "../generated/prisma/client.js";
import { creditReservationResultService } from "./credit-reservation-result.service.js";
import type { CreditReservationResult } from "../schemas/credit-reservation-result.schema.js";

const eventId = "33333333-3333-4333-8333-333333333333";
const correlationId = "44444444-4444-4444-8444-444444444444";
const orderId = "11111111-1111-4111-8111-111111111111";
const requesterId = "22222222-2222-4222-8222-222222222222";
const reservationId = "55555555-5555-4555-8555-555555555555";
const previousReservationId = "66666666-6666-4666-8666-666666666666";

const createPayload = {
    eventId: correlationId,
    eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
    requestType: "CREATE" as const,
    orderId,
    requesterId,
    amount: 10,
};

const renewPayload = {
    eventId: correlationId,
    eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
    requestType: "RENEW" as const,
    orderId,
    requesterId,
    amount: 10,
    previousReservationId,
    expectedVersion: 4,
    expiryAt: "2026-12-01T10:00:00.000Z",
};

const pendingOrder = {
    id: orderId,
    status: OrderStatus.PENDING_RESERVATION,
    version: 1,
    renewalPending: false,
    creditReservationId: null,
};

const expiredOrder = {
    id: orderId,
    status: OrderStatus.EXPIRED,
    version: 4,
    renewalPending: true,
    creditReservationId: previousReservationId,
};

type MockConfig = {
    replay?: unknown | null;
    requestEvent?: unknown | null;
    order?: unknown | null;
    updateCount?: number;
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

function assertAppError(
    error: unknown,
    message: string,
    statusCode: number,
) {
    assert.ok(error instanceof AppError);
    assert.equal(error.message, message);
    assert.equal(error.statusCode, statusCode);
}

function createMockPrisma(config: MockConfig = {}) {
    const order = {
        findUnique: mock.fn(async (_args: unknown) =>
            config.order === undefined ? pendingOrder : config.order,
        ),
        updateMany: mock.fn(async (_args: unknown) => ({
            count: config.updateCount ?? 1,
        })),
    };

    const outboxEvent = {
        findUnique: mock.fn(async (_args: unknown) =>
            config.requestEvent === undefined
                ? {
                    orderId,
                    eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
                    payload: createPayload,
                }
                : config.requestEvent,
        ),
    };

    const creditReservationResultInbox = {
        findUnique: mock.fn(async (_args: unknown) =>
            config.replay ?? null,
        ),
        create: mock.fn(async (_args: unknown) => ({})),
    };

    const orderStatusHistory = {
        create: mock.fn(async (_args: unknown) => ({})),
    };

    const prisma = {
        order,
        outboxEvent,
        creditReservationResultInbox,
        orderStatusHistory,
        $transaction: mock.fn(
            async (
                callback: (tx: typeof prisma) => Promise<void>,
            ) => callback(prisma),
        ),
    };

    return {
        prisma,
        order,
        outboxEvent,
        creditReservationResultInbox,
        orderStatusHistory,
    };
}

function useMockPrisma(
    t: TestContext,
    config: MockConfig = {},
) {
    const mocked = createMockPrisma(config);

    const original = {
        order: sharedPrisma.order,
        outboxEvent: sharedPrisma.outboxEvent,
        inbox: sharedPrisma.creditReservationResultInbox,
        history: sharedPrisma.orderStatusHistory,
        transaction: sharedPrisma.$transaction,
    };

    Object.defineProperty(sharedPrisma, "order", {
        value: mocked.order,
        configurable: true,
    });

    Object.defineProperty(sharedPrisma, "outboxEvent", {
        value: mocked.outboxEvent,
        configurable: true,
    });

    Object.defineProperty(sharedPrisma, "creditReservationResultInbox", {
        value: mocked.creditReservationResultInbox,
        configurable: true,
    });

    Object.defineProperty(sharedPrisma, "orderStatusHistory", {
        value: mocked.orderStatusHistory,
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

        Object.defineProperty(sharedPrisma, "outboxEvent", {
            value: original.outboxEvent,
            configurable: true,
        });

        Object.defineProperty(sharedPrisma, "creditReservationResultInbox", {
            value: original.inbox,
            configurable: true,
        });

        Object.defineProperty(sharedPrisma, "orderStatusHistory", {
            value: original.history,
            configurable: true,
        });

        Object.defineProperty(sharedPrisma, "$transaction", {
            value: original.transaction,
            configurable: true,
        });
    });

    return mocked;
}

function successfulCreateResult(): CreditReservationResult {
    return {
        eventId,
        correlationId,
        requestType: "CREATE",
        orderId,
        eventType: "CREDIT_RESERVATION_SUCCEEDED",
        reservationId,
    };
}

function failedCreateResult(): CreditReservationResult {
    return {
        eventId,
        correlationId,
        requestType: "CREATE",
        orderId,
        eventType: "CREDIT_RESERVATION_FAILED",
        reasonCode: "INSUFFICIENT_CREDITS",
    };
}

function successfulRenewResult(): CreditReservationResult {
    return {
        eventId,
        correlationId,
        requestType: "RENEW",
        orderId,
        eventType: "CREDIT_RESERVATION_SUCCEEDED",
        reservationId,
    };
}

function failedRenewResult(): CreditReservationResult {
    return {
        eventId,
        correlationId,
        requestType: "RENEW",
        orderId,
        eventType: "CREDIT_RESERVATION_FAILED",
        reasonCode: "RENEWAL_FAILED",
    };
}

test("creditReservationResultService applies a successful CREATE result", async (t) => {
    const {
        order,
        orderStatusHistory,
        creditReservationResultInbox,
    } = useMockPrisma(t, {
        order: pendingOrder,
        requestEvent: {
            orderId,
            eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
            payload: createPayload,
        },
    });

    await creditReservationResultService(successfulCreateResult());

    const updateArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(order.updateMany.mock.calls);

    assert.deepEqual(updateArgs.data, {
        status: OrderStatus.OPEN,
        version: { increment: 1 },
        creditReservationId: reservationId,
    });

    const historyArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(orderStatusHistory.create.mock.calls);

    assert.deepEqual(historyArgs.data, {
        orderId,
        fromStatus: OrderStatus.PENDING_RESERVATION,
        toStatus: OrderStatus.OPEN,
        changedBy: null,
        reason: null,
    });

    const inboxArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(creditReservationResultInbox.create.mock.calls);

    assert.equal(inboxArgs.data.eventId, eventId);
    assert.equal(
        inboxArgs.data.eventType,
        CreditReservationResultType.CREDIT_RESERVATION_SUCCEEDED,
    );
});

test("creditReservationResultService applies a failed CREATE result", async (t) => {
    const { order, orderStatusHistory } = useMockPrisma(t, {
        order: pendingOrder,
        requestEvent: {
            orderId,
            eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
            payload: createPayload,
        },
    });

    await creditReservationResultService(failedCreateResult());

    const updateArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(order.updateMany.mock.calls);

    assert.deepEqual(updateArgs.data, {
        status: OrderStatus.RESERVATION_FAILED,
        version: { increment: 1 },
        reservationFailureCode: "INSUFFICIENT_CREDITS",
    });

    const historyArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(orderStatusHistory.create.mock.calls);

    assert.equal(historyArgs.data.toStatus, OrderStatus.RESERVATION_FAILED);
    assert.equal(historyArgs.data.reason, "INSUFFICIENT_CREDITS");
});

test("creditReservationResultService applies a successful RENEW result", async (t) => {
    const { order, orderStatusHistory } = useMockPrisma(t, {
        order: expiredOrder,
        requestEvent: {
            orderId,
            eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
            payload: renewPayload,
        },
    });

    await creditReservationResultService(successfulRenewResult());

    const updateArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(order.updateMany.mock.calls);

    assert.equal(updateArgs.data.status, OrderStatus.OPEN);
    assert.deepEqual(updateArgs.data.version, { increment: 1 });
    assert.equal(updateArgs.data.creditReservationId, reservationId);
    assert.equal(updateArgs.data.renewalPending, false);
    assert.equal(updateArgs.data.renewalFailureCode, null);
    assert.ok(updateArgs.data.expiryAt instanceof Date);

    const historyArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(orderStatusHistory.create.mock.calls);

    assert.deepEqual(historyArgs.data, {
        orderId,
        fromStatus: OrderStatus.EXPIRED,
        toStatus: OrderStatus.OPEN,
        changedBy: null,
        reason: "Request renewed",
    });
});

test("creditReservationResultService applies a failed RENEW result", async (t) => {
    const { order, orderStatusHistory } = useMockPrisma(t, {
        order: expiredOrder,
        requestEvent: {
            orderId,
            eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
            payload: renewPayload,
        },
    });

    await creditReservationResultService(failedRenewResult());

    const updateArgs = firstArgument<{
        data: Record<string, unknown>;
    }>(order.updateMany.mock.calls);

    assert.deepEqual(updateArgs.data, {
        renewalPending: false,
        renewalFailureCode: "RENEWAL_FAILED",
        version: { increment: 1 },
    });

    assert.equal(orderStatusHistory.create.mock.calls.length, 0);
});

test("creditReservationResultService ignores an identical replay", async (t) => {
    const event = successfulCreateResult();

    useMockPrisma(t, {
        replay: {
            correlationId,
            eventType: CreditReservationResultType.CREDIT_RESERVATION_SUCCEEDED,
            payload: event,
        },
    });

    await creditReservationResultService(event);
});

test("creditReservationResultService rejects a replay with different data", async (t) => {
    const event = successfulCreateResult();

    useMockPrisma(t, {
        replay: {
            correlationId,
            eventType: CreditReservationResultType.CREDIT_RESERVATION_SUCCEEDED,
            payload: {
                ...event,
                reservationId: previousReservationId,
            },
        },
    });

    await assert.rejects(
        creditReservationResultService(event),
        (error) => {
            assertAppError(
                error,
                "Credit result event ID was reused with different data",
                409,
            );
            return true;
        },
    );
});

test("creditReservationResultService rejects a missing request event", async (t) => {
    useMockPrisma(t, {
        requestEvent: null,
    });

    await assert.rejects(
        creditReservationResultService(successfulCreateResult()),
        (error) => {
            assertAppError(
                error,
                "Credit result does not match a reservation request",
                409,
            );
            return true;
        },
    );
});

test("creditReservationResultService rejects a mismatched request payload", async (t) => {
    useMockPrisma(t, {
        requestEvent: {
            orderId,
            eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
            payload: {
                ...createPayload,
                orderId: previousReservationId,
            },
        },
    });

    await assert.rejects(
        creditReservationResultService(successfulCreateResult()),
        (error) => {
            assertAppError(
                error,
                "Credit result does not match the original request payload",
                409,
            );
            return true;
        },
    );
});

test("creditReservationResultService rejects a missing CREATE order", async (t) => {
    useMockPrisma(t, {
        order: null,
        requestEvent: {
            orderId,
            eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
            payload: createPayload,
        },
    });

    await assert.rejects(
        creditReservationResultService(successfulCreateResult()),
        (error) => {
            assertAppError(
                error,
                "Order for credit result was not found",
                404,
            );
            return true;
        },
    );
});

test("creditReservationResultService rejects an order that is not pending reservation", async (t) => {
    useMockPrisma(t, {
        order: {
            ...pendingOrder,
            status: OrderStatus.OPEN,
        },
    });

    await assert.rejects(
        creditReservationResultService(successfulCreateResult()),
        (error) => {
            assertAppError(
                error,
                "Order is no longer awaiting credit reservation",
                409,
            );
            return true;
        },
    );
});

test("creditReservationResultService rejects a renewal when the order changed", async (t) => {
    useMockPrisma(t, {
        order: {
            ...expiredOrder,
            version: 99,
        },
        requestEvent: {
            orderId,
            eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
            payload: renewPayload,
        },
    });

    await assert.rejects(
        creditReservationResultService(successfulRenewResult()),
        (error) => {
            assertAppError(
                error,
                "Order changed while its renewal was processing",
                409,
            );
            return true;
        },
    );
});

test("creditReservationResultService rejects a concurrent CREATE update", async (t) => {
    useMockPrisma(t, {
        updateCount: 0,
    });

    await assert.rejects(
        creditReservationResultService(successfulCreateResult()),
        (error) => {
            assertAppError(
                error,
                "Order changed while applying credit result",
                409,
            );
            return true;
        },
    );
});

test("creditReservationResultService rejects a concurrent RENEW update", async (t) => {
    useMockPrisma(t, {
        order: expiredOrder,
        requestEvent: {
            orderId,
            eventType: OrderEventType.CREDIT_RESERVATION_REQUEST,
            payload: renewPayload,
        },
        updateCount: 0,
    });

    await assert.rejects(
        creditReservationResultService(successfulRenewResult()),
        (error) => {
            assertAppError(
                error,
                "Order changed while applying renewal result",
                409,
            );
            return true;
        },
    );
});