import test from "node:test";
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";

import { prisma as sharedPrisma } from "../libs/prisma.js";
import { AppError } from "../errors/errors.js";
import {
    OrderStatus,
    OrderEventType,
} from "../generated/prisma/client.js";

const verifySupplierExists = mock.fn(
    async (_supplierId: string): Promise<boolean> => true,
);

mock.module("../integrations/supplier/supplier.client.js", {
    namedExports: {
        verifySupplierExists,
    },
});

const {
    getRequesterOrderHistoryService,
    updateRequestService,
    createRequestService,
    receiveRequestService,
    failRequestService,
    cancelRequestService,
    renewExpiredRequestService,
} = await import("./order.requester.service.js");


interface MockConfig {
    orderFindMany?: unknown[];
    orderFindUnique?: unknown | null;
    orderFindFirstOrThrow?: unknown;
    orderFindUniqueOrThrow?: unknown;
    orderCount?: number;
    orderCreate?: unknown;
    orderUpdateManyCount?: number;
}

type MockCall = {
    arguments: readonly unknown[];
};

type UpdateData = {
    id?: string;
    requesterId?: string;
    courierId?: string | null;
    name?: string;
    description?: string;
    pickupSupplierId?: string;
    deliverySupplierId?: string;
    offeredCredits?: number;
    remarks?: string | null;
    expiryAt?: Date;
    status?: OrderStatus;
    creditReservationId?: string | null;
    receivedAt?: unknown;
    failedAt?: unknown;
    canceledAt?: unknown;
    failureReason?: string;
    cancellationReason?: string | null;
    version?: { increment: number } | number;
};

type QueryArgs = {
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
    skip?: number;
    take?: number;
    data?: UpdateData;
};

type OutboxArgs = {
    data: {
        eventType: OrderEventType;
        payload?: Record<string, unknown>;
    };
};

const requesterId = "requester-1";
const otherRequesterId = "requester-2";
const orderId = "order-1";
const courierId = "courier-1";
const reservationId = "reservation-1";

const now = new Date();
const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
const pastExpiry = new Date(Date.now() - 60 * 60 * 1000);

const baseOrder = {
    id: orderId,
    requesterId,
    courierId: null,
    name: "Collect coffee",
    description: "Collect coffee from supplier",
    pickupSupplierId: "pickup-1",
    deliverySupplierId: "delivery-1",
    offeredCredits: 10,
    remarks: null,
    status: OrderStatus.OPEN,
    expiryAt: futureExpiry,
    version: 1,
    createdAt: now,
    updatedAt: now,
    acceptedAt: null,
    pickedUpAt: null,
    completedAt: null,
    receivedAt: null,
    canceledAt: null,
    expiredAt: null,
    failedAt: null,
    cancellationReason: null,
    failureReason: null,
    creditReservationId: reservationId,
    reservationFailureCode: null,
    renewalPending: false,
    renewalFailureCode: null,
};

const validCreateInput = {
    name: "  Collect coffee  ",
    description: "  Collect coffee from supplier  ",
    pickupSupplierId: "pickup-1",
    deliverySupplierId: "delivery-1",
    offeredCredits: 10,
    remarks: "  Leave at the counter  ",
    expiryAt: futureExpiry,
};

function assertIsDate(value: unknown): asserts value is Date {
    assert.ok(value instanceof Date, "Expected a Date value");
}

function firstMockArgument<T>(calls: readonly MockCall[]): T {
    const call = calls[0];
    assert.ok(call, "Expected mock to have been called");

    const argument = call.arguments[0];
    assert.ok(argument, "Expected mock call to have an argument");

    return argument as T;
}

function createMockPrisma(config: MockConfig = {}) {
    const order = {
        findMany: mock.fn(async (_args: unknown) => config.orderFindMany ?? []),

        findUnique: mock.fn(async (_args: unknown) =>
            config.orderFindUnique ?? null,
        ),

        findFirstOrThrow: mock.fn(async (_args: unknown) =>
            config.orderFindFirstOrThrow ?? baseOrder,
        ),

        findUniqueOrThrow: mock.fn(async (_args: unknown) =>
            config.orderFindUniqueOrThrow ?? baseOrder,
        ),

        count: mock.fn(async (_args: unknown) => config.orderCount ?? 0),

        create: mock.fn(async (args: unknown) => {
            if (config.orderCreate !== undefined) {
                return config.orderCreate;
            }

            const createArgs = args as {
                data: Record<string, unknown>;
            };

            return createArgs.data;
        }),

        updateMany: mock.fn(async (_args: unknown) => ({
            count: config.orderUpdateManyCount ?? 1,
        })),
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
            async (callback: (tx: typeof prisma) => Promise<unknown>) =>
                callback(prisma),
        ),
    };

    return { prisma, order, orderStatusHistory, outboxEvent };
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

function assertAppError(
    error: unknown,
    message: string,
    statusCode: number,
) {
    assert.ok(error instanceof AppError);
    assert.equal(error.message, message);
    assert.equal(error.statusCode, statusCode);
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

test("getRequesterOrderHistoryService returns paginated history", async (t) => {
    const { order } = useMockPrisma(t, {
        orderFindMany: [baseOrder],
        orderCount: 21,
    });

    const result = await getRequesterOrderHistoryService(requesterId, {
        page: 2,
        limit: 10,
        sortBy: "createdAt",
        sortOrder: "desc",
    });

    assert.deepEqual(result.orders, [baseOrder]);
    assert.deepEqual(result.pagination, {
        page: 2,
        limit: 10,
        totalCount: 21,
        totalPages: 3,
    });

    const findManyArgs = firstMockArgument<QueryArgs>(
        order.findMany.mock.calls,
    );

    assert.deepEqual(findManyArgs, {
        where: { requesterId },
        orderBy: { createdAt: "desc" },
        skip: 10,
        take: 10,
    });

});

test("getRequesterOrderHistoryService filters by status", async (t) => {
    const { order } = useMockPrisma(t);

    await getRequesterOrderHistoryService(requesterId, {
        page: 1,
        limit: 15,
        status: OrderStatus.OPEN,
        sortBy: "expiryAt",
        sortOrder: "asc",
    });

    const findManyArgs = firstMockArgument<QueryArgs>(
        order.findMany.mock.calls,
    );

    assert.deepEqual(findManyArgs.where, {
        requesterId,
        status: OrderStatus.OPEN,
    });
});

/* -------------------------------------------------------------------------- */
/* Update                                                                     */
/* -------------------------------------------------------------------------- */

test("updateRequestService rejects a missing order", async (t) => {
    useMockPrisma(t, { orderFindUnique: null });

    await assert.rejects(
        updateRequestService(requesterId, orderId, {
            expectedVersion: 1,
            name: "Updated name",
        }),
        (error) => {
            assertAppError(error, "Order not found", 404);
            return true;
        },
    );
});

test("updateRequestService rejects an order owned by another requester", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: {
            ...baseOrder,
            requesterId: otherRequesterId,
        },
    });

    await assert.rejects(
        updateRequestService(requesterId, orderId, {
            expectedVersion: 1,
            name: "Updated name",
        }),
        (error) => {
            assertAppError(error, "Order not found", 404);
            return true;
        },
    );
});

test("updateRequestService rejects an outdated version", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: {
            ...baseOrder,
            version: 2,
        },
    });

    await assert.rejects(
        updateRequestService(requesterId, orderId, {
            expectedVersion: 1,
            name: "Updated name",
        }),
        (error) => {
            assertAppError(
                error,
                "The request changed while you were editing it. Reload and try again.",
                409,
            );
            return true;
        },
    );
});

test("updateRequestService rejects an accepted order", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: {
            ...baseOrder,
            status: OrderStatus.ACCEPTED,
            courierId,
        },
    });

    await assert.rejects(
        updateRequestService(requesterId, orderId, {
            expectedVersion: 1,
            name: "Updated name",
        }),
        (error) => {
            assertAppError(
                error,
                "This request has already been accepted and cannot be updated",
                409,
            );
            return true;
        },
    );
});

test("updateRequestService rejects an expiry date in the past", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: baseOrder,
    });

    await assert.rejects(
        updateRequestService(requesterId, orderId, {
            expectedVersion: 1,
            expiryAt: pastExpiry,
        }),
        (error) => {
            assertAppError(
                error,
                "Completion deadline must be in the future",
                400,
            );
            return true;
        },
    );
});

test("updateRequestService updates only supplied fields and increments version", async (t) => {
    const { order } = useMockPrisma(t, {
        orderFindUnique: baseOrder,
        orderFindFirstOrThrow: {
            ...baseOrder,
            name: "Updated name",
            version: 2,
        },
    });

    const result = await updateRequestService(requesterId, orderId, {
        expectedVersion: 1,
        name: "Updated name",
    });

    assert.equal(result.name, "Updated name");
    const updateCall = order.updateMany.mock.calls[0];
    assert.ok(updateCall);

    const updateArgs = firstMockArgument<QueryArgs>(
        order.updateMany.mock.calls,
    );

    assert.deepEqual(updateArgs, {
        where: {
            id: orderId,
            requesterId,
            status: OrderStatus.OPEN,
            courierId: null,
            version: 1,
        },
        data: {
            name: "Updated name",
            version: { increment: 1 },
        },
    });
});

test("updateRequestService rejects a concurrent update", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: baseOrder,
        orderUpdateManyCount: 0,
    });

    await assert.rejects(
        updateRequestService(requesterId, orderId, {
            expectedVersion: 1,
            name: "Updated name",
        }),
        (error) => {
            assertAppError(
                error,
                "The request changed while you were updating it. Reload and try again.",
                409,
            );
            return true;
        },
    );
});

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */
test.afterEach(() => {
    verifySupplierExists.mock.resetCalls();
    verifySupplierExists.mock.mockImplementation(
        async (_supplierId: string): Promise<boolean> => true,
    );
});

test("createRequestService rejects an expired request", async (t) => {
    useMockPrisma(t);

    await assert.rejects(
        createRequestService(requesterId, {
            ...validCreateInput,
            expiryAt: pastExpiry,
        }),
        (error) => {
            assertAppError(
                error,
                "Completion deadline must be in the future",
                400,
            );
            return true;
        },
    );

    assert.equal(verifySupplierExists.mock.calls.length, 0);
});

test("createRequestService rejects a missing pickup supplier", async (t) => {
    useMockPrisma(t);

    verifySupplierExists.mock.mockImplementation(
        async (supplierId: string) =>
            supplierId !== validCreateInput.pickupSupplierId,
    );

    await assert.rejects(
        createRequestService(requesterId, validCreateInput),
        (error) => {
            assertAppError(error, "Pickup supplier does not exist", 404);
            return true;
        },
    );
});

test("createRequestService rejects a missing delivery supplier", async (t) => {
    useMockPrisma(t);

    verifySupplierExists.mock.mockImplementation(
        async (supplierId: string) =>
            supplierId !== validCreateInput.deliverySupplierId,
    );

    await assert.rejects(
        createRequestService(requesterId, validCreateInput),
        (error) => {
            assertAppError(error, "Delivery supplier does not exist", 404);
            return true;
        },
    );
});

test("createRequestService creates the order, history, and outbox event", async (t) => {
    const { order, orderStatusHistory, outboxEvent } = useMockPrisma(t);

    verifySupplierExists.mock.mockImplementation(
        async () => true,
    );

    const result = await createRequestService(
        requesterId,
        validCreateInput,
    );

    const orderArgs = firstMockArgument<QueryArgs>(
        order.create.mock.calls,
    );

    const createdOrderId = orderArgs.data?.id;

    assert.ok(typeof createdOrderId === "string");

    assert.deepEqual(orderArgs.data, {
        id: createdOrderId,
        requesterId,
        courierId: null,
        name: validCreateInput.name,
        description: validCreateInput.description,
        pickupSupplierId: validCreateInput.pickupSupplierId,
        deliverySupplierId: validCreateInput.deliverySupplierId,
        offeredCredits: validCreateInput.offeredCredits,
        remarks: validCreateInput.remarks,
        expiryAt: validCreateInput.expiryAt,
        status: OrderStatus.PENDING_RESERVATION,
        version: 1,
        creditReservationId: null,
    });

    assert.deepEqual(result, orderArgs.data);

    const historyArgs = firstMockArgument<QueryArgs>(
        orderStatusHistory.create.mock.calls,
    );

    assert.deepEqual(historyArgs.data, {
        orderId: createdOrderId,
        fromStatus: null,
        toStatus: OrderStatus.PENDING_RESERVATION,
        changedBy: requesterId,
        reason: "Waiting for credit reservation to be confirmed",
    });

    const outboxArgs = firstMockArgument<OutboxArgs>(
        outboxEvent.create.mock.calls,
    );

    assert.equal(
        outboxArgs.data.eventType,
        OrderEventType.CREDIT_RESERVATION_REQUEST,
    );

    assert.equal(outboxArgs.data.payload?.requestType, "CREATE");
    assert.equal(outboxArgs.data.payload?.orderId, createdOrderId);
    assert.equal(outboxArgs.data.payload?.requesterId, requesterId);
    assert.equal(outboxArgs.data.payload?.amount, 10);
});

/* -------------------------------------------------------------------------- */
/* Receive                                                                    */
/* -------------------------------------------------------------------------- */

test("receiveRequestService rejects an incomplete order", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: baseOrder,
    });

    await assert.rejects(
        receiveRequestService(requesterId, orderId, {
            expectedVersion: 1,
        }),
        (error) => {
            assertAppError(
                error,
                "The courier must complete the request before you can mark it as received",
                409,
            );
            return true;
        },
    );
});

test("receiveRequestService changes a completed order to received", async (t) => {
    const completedOrder = {
        ...baseOrder,
        status: OrderStatus.COMPLETED,
        courierId,
        version: 4,
    };

    const { order, orderStatusHistory, outboxEvent } = useMockPrisma(t, {
        orderFindUnique: completedOrder,
        orderFindUniqueOrThrow: {
            ...completedOrder,
            status: OrderStatus.RECEIVED,
            version: 5,
        },
    });

    const result = await receiveRequestService(requesterId, orderId, {
        expectedVersion: 4,
    });

    assert.equal(result.status, OrderStatus.RECEIVED);

    const updateArgs = firstMockArgument<QueryArgs>(
        order.updateMany.mock.calls,
    );

    assert.equal(updateArgs.data?.status, OrderStatus.RECEIVED);
    assert.deepEqual(updateArgs.data?.version, { increment: 1 });
    assertIsDate(updateArgs.data?.receivedAt);

    assert.equal(orderStatusHistory.create.mock.calls.length, 1);
    assert.equal(outboxEvent.create.mock.calls.length, 1);

    const outboxArgs = firstMockArgument<OutboxArgs>(
        outboxEvent.create.mock.calls,
    );

    assert.equal(
        outboxArgs.data.eventType,
        OrderEventType.ORDER_RECEIVED,
    );
});

test("receiveRequestService rejects a concurrent update", async (t) => {
    const completedOrder = {
        ...baseOrder,
        status: OrderStatus.COMPLETED,
        courierId,
        version: 4,
    };

    useMockPrisma(t, {
        orderFindUnique: completedOrder,
        orderUpdateManyCount: 0,
    });

    await assert.rejects(
        receiveRequestService(requesterId, orderId, {
            expectedVersion: 4,
        }),
        (error) => {
            assertAppError(
                error,
                "The request changed while being marked as received. Reload and try again.",
                409,
            );
            return true;
        },
    );
});

/* -------------------------------------------------------------------------- */
/* Fail                                                                       */
/* -------------------------------------------------------------------------- */

test("failRequestService changes a completed order to failed", async (t) => {
    const completedOrder = {
        ...baseOrder,
        status: OrderStatus.COMPLETED,
        courierId,
        version: 4,
    };

    const { order, orderStatusHistory, outboxEvent } = useMockPrisma(t, {
        orderFindUnique: completedOrder,
        orderFindUniqueOrThrow: {
            ...completedOrder,
            status: OrderStatus.FAILED,
            failureReason: "Wrong item delivered",
            version: 5,
        },
    });

    await failRequestService(requesterId, orderId, {
        expectedVersion: 4,
        failureReason: "Wrong item delivered",
    });

    const updateArgs = firstMockArgument<QueryArgs>(
        order.updateMany.mock.calls,
    );

    assert.equal(updateArgs.data?.status, OrderStatus.FAILED);
    assert.equal(
        updateArgs.data?.failureReason,
        "Wrong item delivered",
    );
    assert.deepEqual(updateArgs.data?.version, { increment: 1 });
    assertIsDate(updateArgs.data?.failedAt);

    assert.equal(orderStatusHistory.create.mock.calls.length, 1);
    assert.equal(outboxEvent.create.mock.calls.length, 1);

    const outboxArgs = firstMockArgument<OutboxArgs>(
        outboxEvent.create.mock.calls,
    );
    assert.equal(
        outboxArgs.data.eventType,
        OrderEventType.ORDER_FAILED,
    );
});

test("failRequestService rejects an order without a reservation", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: {
            ...baseOrder,
            status: OrderStatus.COMPLETED,
            courierId,
            creditReservationId: null,
        },
    });

    await assert.rejects(
        failRequestService(requesterId, orderId, {
            expectedVersion: 1,
            failureReason: "Damaged item",
        }),
        (error) => {
            assertAppError(
                error,
                "This order does not have a credit reservation to refund",
                409,
            );
            return true;
        },
    );
});

/* -------------------------------------------------------------------------- */
/* Cancel                                                                     */
/* -------------------------------------------------------------------------- */

test("cancelRequestService cancels an open order", async (t) => {
    const { order, orderStatusHistory, outboxEvent } = useMockPrisma(t, {
        orderFindUnique: baseOrder,
        orderFindUniqueOrThrow: {
            ...baseOrder,
            status: OrderStatus.CANCELED,
            cancellationReason: "No longer needed",
            version: 2,
        },
    });

    await cancelRequestService(requesterId, orderId, {
        expectedVersion: 1,
        cancellationReason: "No longer needed",
    });

    const updateArgs = firstMockArgument<QueryArgs>(
        order.updateMany.mock.calls,
    );

    assert.equal(updateArgs.data?.status, OrderStatus.CANCELED);
    assert.equal(
        updateArgs.data?.cancellationReason,
        "No longer needed",
    );
    assert.deepEqual(updateArgs.data?.version, { increment: 1 });
    assertIsDate(updateArgs.data?.canceledAt);

    assert.equal(orderStatusHistory.create.mock.calls.length, 1);
    assert.equal(outboxEvent.create.mock.calls.length, 1);

    const outboxArgs = firstMockArgument<OutboxArgs>(
        outboxEvent.create.mock.calls,
    );
    assert.equal(
        outboxArgs.data.eventType,
        OrderEventType.ORDER_CANCELED,
    );
});

test("cancelRequestService stores null when no reason is supplied", async (t) => {
    const { order } = useMockPrisma(t, {
        orderFindUnique: baseOrder,
    });

    await cancelRequestService(requesterId, orderId, {
        expectedVersion: 1,
    });

    const updateArgs = firstMockArgument<QueryArgs>(
        order.updateMany.mock.calls,
    );

    assert.equal(updateArgs.data?.cancellationReason, null);
});

test("cancelRequestService rejects an order with a courier", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: {
            ...baseOrder,
            courierId,
        },
    });

    await assert.rejects(
        cancelRequestService(requesterId, orderId, {
            expectedVersion: 1,
        }),
        (error) => {
            assertAppError(
                error,
                "This request has already been accepted and cannot be canceled",
                409,
            );
            return true;
        },
    );
});

/* -------------------------------------------------------------------------- */
/* Renew                                                                      */
/* -------------------------------------------------------------------------- */

test("renewExpiredRequestService renews an expired order", async (t) => {
    const expiredOrder = {
        ...baseOrder,
        status: OrderStatus.EXPIRED,
        version: 3,
        renewalPending: false,
    };

    const { order, outboxEvent } = useMockPrisma(t, {
        orderFindUnique: expiredOrder,
        orderFindUniqueOrThrow: {
            ...expiredOrder,
            renewalPending: true,
        },
    });

    const newExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await renewExpiredRequestService(requesterId, orderId, {
        expectedVersion: 3,
        expiryAt: newExpiry,
    });

    const outboxArgs = firstMockArgument<OutboxArgs>(
        outboxEvent.create.mock.calls,
    );

    const payload = outboxArgs.data.payload;
    assert.ok(payload);

    assert.equal(payload.requestType, "RENEW");
    assert.equal(payload.previousReservationId, reservationId);
    assert.equal(payload.expiryAt, newExpiry.toISOString());
});

test("renewExpiredRequestService rejects a non-expired order", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: baseOrder,
    });

    await assert.rejects(
        renewExpiredRequestService(requesterId, orderId, {
            expectedVersion: 1,
            expiryAt: futureExpiry,
        }),
        (error) => {
            assertAppError(
                error,
                "Only expired requests can be renewed",
                409,
            );
            return true;
        },
    );
});

test("renewExpiredRequestService rejects an already pending renewal", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: {
            ...baseOrder,
            status: OrderStatus.EXPIRED,
            renewalPending: true,
        },
    });

    await assert.rejects(
        renewExpiredRequestService(requesterId, orderId, {
            expectedVersion: 1,
            expiryAt: futureExpiry,
        }),
        (error) => {
            assertAppError(
                error,
                "A renewal request is already being processed",
                409,
            );
            return true;
        },
    );
});

test("renewExpiredRequestService rejects an outdated version", async (t) => {
    useMockPrisma(t, {
        orderFindUnique: {
            ...baseOrder,
            status: OrderStatus.EXPIRED,
            version: 2,
        },
    });

    await assert.rejects(
        renewExpiredRequestService(requesterId, orderId, {
            expectedVersion: 1,
            expiryAt: futureExpiry,
        }),
        (error) => {
            assertAppError(
                error,
                "The request changed while you were renewing it. Reload and try again.",
                409,
            );
            return true;
        },
    );
});