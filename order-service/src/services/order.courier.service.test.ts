// AI Assistance Disclosure:
// Tool: Claude Code (Opus 5.5)
// Date: 2026-10-28, 2026-11-04
// Scope: Generated boilerplate code for setting up mock Prisma and unit testing for courier-related functions.
//        Corrected test cases after changes in backend functions (to include optimistic concurrency control).
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import test from "node:test";
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";
import { prisma as sharedPrisma } from "../libs/prisma.js";
import {
    acceptOpenOrder,
    completePickedUpOrder,
    dropAcceptedOrder,
    getAllOpenOrders,
    getCourierAcceptanceHistory,
    pickUpAcceptedOrder
} from "./order.courier.service.js";
import type { GetCourierOrderHistoryInput, GetOpenOrdersInput } from "../schemas/order.courier.schema.js"
import { AppError } from "../errors/errors.js";

const now: Date = new Date();

const MOCK_OPEN_ORDER = {
    id: "order_1",
    requesterId: "stu_1",
    courierId: null,
    name: "buy coffee",
    description: "1 iced latte, less sugar",
    pickupSupplierId: "sup_1",
    deliverySupplierId: "sup_2",
    offeredCredits: 5,
    remarks: null,
    status: "OPEN",
    expiryAt: new Date(now.getTime() + 60 * 60 * 1000), // expires 1 hour from now
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
    creditReservationId: "cr1",
};

const MOCK_ACCEPTED_ORDER = { ...MOCK_OPEN_ORDER, courierId: "stu_2", status: "ACCEPTED", version: 2, acceptedAt: now };

const MOCK_PICKED_UP_ORDER = { ...MOCK_ACCEPTED_ORDER, status: "PICKED_UP", version: 3, pickedUpAt: now };

const MOCK_COMPLETED_ORDER = { ...MOCK_PICKED_UP_ORDER, status: "COMPLETED", version: 4, completedAt: now };

const VALID_GET_OPEN_ORDERS_INPUT: GetOpenOrdersInput = {
    page: 1,
    sortBy: "expiryAt", // default value
    sortOrder: "asc" // default value
}

const VALID_DEFAULT_COURIER_ACCEPTANCE_INPUT: GetCourierOrderHistoryInput = {
    page: 1,
    sortBy: "acceptedAt",
    sortOrder: "desc"
}

interface MockConfig {
    findManyReturn?: unknown[] | null;
    findUniqueReturn?: unknown | null;
    countReturn?: number;
    updateReturn?: unknown;
    orderStatusHistoryCreateReturn?: unknown | null;
}

function createMockPrisma(config: MockConfig = {}) {
    const calls = {
        findMany: 0,
        findUnique: 0,
        count: 0,
        update: 0,
        orderStatusHistoryCreate: 0,
        transaction: 0,
    };

    const captured = {
        findManyArgs: undefined as unknown,
        findUniqueArgs: undefined as unknown,
        countArgs: undefined as unknown,
        updateArgs: undefined as unknown,
        orderStatusHistoryCreateArgs: undefined as unknown,
    };

    const outboxEvent = {
        create: mock.fn(async (_args: unknown) => ({})),
    };

    const prisma = {
        order: {
            findMany: mock.fn(async (args: unknown) => {
                calls.findMany++;
                captured.findManyArgs = args;
                return "findManyReturn" in config ? config.findManyReturn : []; // allow null to be returned
            }),
            count: mock.fn(async (args: unknown) => {
                calls.count++;
                captured.countArgs = args;
                return config.countReturn ?? 0;
            }),
            findUnique: mock.fn(async (args: unknown) => {
                calls.findUnique++;
                captured.findUniqueArgs = args;
                return config.findUniqueReturn ?? null;
            }),
            update: mock.fn(async (args: unknown) => {
                calls.update++;
                captured.updateArgs = args;
                return config.updateReturn ?? {};
            }),
        },
        orderStatusHistory: {
            create: mock.fn(async (args: unknown) => {
                calls.orderStatusHistoryCreate++;
                captured.orderStatusHistoryCreateArgs = args;
                return "orderStatusHistoryCreateReturn" in config ? config.orderStatusHistoryCreateReturn : {}; // allow null to be returned
            }),
        },
        outboxEvent,
        // run the transaction callback with the mock client as tx, so tx.order and tx.orderStatusHistory use the mock tables
        $transaction: mock.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
            calls.transaction++;
            return callback(prisma);
        }),
    };


    return { prisma, calls, captured };
}

// use the mock order and orderStatusHistory tables and $transaction when running the test, instead of the actual shared prisma client
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

test("getAllOpenOrders returns open orders with pagination when no filters are given", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: [MOCK_OPEN_ORDER],
        countReturn: 1,
    });

    const result = await getAllOpenOrders("stu_2", VALID_GET_OPEN_ORDERS_INPUT);

    // check arguments passed into prisma findMany query
    const findManyArgs = captured.findManyArgs as { where: Record<string, unknown>; orderBy: unknown; take: number; skip: number };
    assert.deepEqual(findManyArgs.where.name, { contains: "", mode: "insensitive" });
    assert.equal(findManyArgs.where.status, "OPEN");
    assert.deepEqual(findManyArgs.where.requesterId, { not: "stu_2" }); // ensure courier cannot see their own orders
    assert.ok((findManyArgs.where.expiryAt as { gt: Date }).gt instanceof Date); // expired orders are excluded
    assert.equal(findManyArgs.where.OR, undefined); // no location filter
    assert.deepEqual(findManyArgs.orderBy, { expiryAt: "asc" });
    assert.equal(findManyArgs.take, 15);
    assert.equal(findManyArgs.skip, 0);

    // check arguments passed into prisma count query
    const countArgs = captured.countArgs as { where: Record<string, unknown> };
    assert.deepEqual(countArgs.where, findManyArgs.where);

    // check result obtained
    assert.deepEqual(result.orders, [MOCK_OPEN_ORDER]);
    assert.deepEqual(result.pagination, { limit: 15, page: 1, totalCount: 1, totalPages: 1 });

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("getAllOpenOrders applies the search string, location filter, sorting and page offset", async (t) => {
    const input: GetOpenOrdersInput = { page: 2, sortBy: "offeredCredits", sortOrder: "desc", filterLocation: "sup_1", searchString: "coffee" };

    const { calls, captured } = useSharedMockPrisma(t, { findManyReturn: [MOCK_OPEN_ORDER], countReturn: 16 });

    const result = await getAllOpenOrders("stu_2", input);

    // check arguments passed into prisma findMany query
    const findManyArgs = captured.findManyArgs as { where: Record<string, unknown>; orderBy: unknown; take: number; skip: number };
    assert.deepEqual(findManyArgs.where.name, { contains: "coffee", mode: "insensitive" });
    assert.equal(findManyArgs.where.status, "OPEN");
    assert.deepEqual(findManyArgs.where.requesterId, { not: "stu_2" }); // ensure courier cannot see their own orders
    assert.ok((findManyArgs.where.expiryAt as { gt: Date }).gt instanceof Date); // expired orders are excluded
    assert.deepEqual(findManyArgs.where.OR, [{ deliverySupplierId: "sup_1" }, { pickupSupplierId: "sup_1" }]);
    assert.deepEqual(findManyArgs.orderBy, { offeredCredits: "desc" });
    assert.equal(findManyArgs.take, 15);
    assert.equal(findManyArgs.skip, 15);

    // check arguments passed into prisma count query
    const countArgs = captured.countArgs as { where: Record<string, unknown> };
    assert.deepEqual(countArgs.where, findManyArgs.where);

    // check result obtained
    assert.deepEqual(result.orders, [MOCK_OPEN_ORDER]);
    assert.deepEqual(result.pagination, { limit: 15, page: 2, totalCount: 16, totalPages: 2 });

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("getAllOpenOrders returns empty array when there are no records found", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: [],
        countReturn: 0,
    });

    const result = await getAllOpenOrders("stu_2", VALID_GET_OPEN_ORDERS_INPUT);

    // check arguments passed into prisma findMany query
    const findManyArgs = captured.findManyArgs as { where: Record<string, unknown>; orderBy: unknown; take: number; skip: number };
    assert.deepEqual(findManyArgs.where.name, { contains: "", mode: "insensitive" });
    assert.equal(findManyArgs.where.status, "OPEN");
    assert.deepEqual(findManyArgs.where.requesterId, { not: "stu_2" }); // ensure courier cannot see their own orders
    assert.ok((findManyArgs.where.expiryAt as { gt: Date }).gt instanceof Date); // expired orders are excluded
    assert.equal(findManyArgs.where.OR, undefined); // no location filter
    assert.deepEqual(findManyArgs.orderBy, { expiryAt: "asc" });
    assert.equal(findManyArgs.take, 15);
    assert.equal(findManyArgs.skip, 0);

    // check arguments passed into prisma count query
    const countArgs = captured.countArgs as { where: Record<string, unknown> };
    assert.deepEqual(countArgs.where, findManyArgs.where);

    // check result obtained
    assert.deepEqual(result.orders, []);
    assert.deepEqual(result.pagination, { limit: 15, page: 1, totalCount: 0, totalPages: 0 });

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("getAllOpenOrders returns error code 400 when Prisma returns null", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findManyReturn: null });

    await assert.rejects(
        () => getAllOpenOrders("stu_2", VALID_GET_OPEN_ORDERS_INPUT),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            assert.equal(error.code, "BAD_REQUEST");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("acceptOpenOrder returns error code 404 when the order with specified id does not exist", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: null });

    await assert.rejects(
        () => acceptOpenOrder("stu_2", "id_that_does_not_exist", { expectedVersion: 1 }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 404);
            assert.equal(error.code, "NOT_FOUND");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("acceptOpenOrder returns error code 409 when the order status is EXPIRED", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: { ...MOCK_OPEN_ORDER, status: "EXPIRED" },
    });

    await assert.rejects(
        () => acceptOpenOrder("stu_2", MOCK_OPEN_ORDER.id, { expectedVersion: MOCK_OPEN_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, "CONFLICT");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("acceptOpenOrder returns error code 409 when the time stated in expiryAt has passed", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: { ...MOCK_OPEN_ORDER, expiryAt: new Date(Date.now() - 1) },
    });

    await assert.rejects(
        () => acceptOpenOrder("stu_2", MOCK_OPEN_ORDER.id, { expectedVersion: MOCK_OPEN_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, "CONFLICT");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("acceptOpenOrder returns error code 409 when expected version is different", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_OPEN_ORDER,
    });

    await assert.rejects(
        () => acceptOpenOrder("stu_2", MOCK_OPEN_ORDER.id, { expectedVersion: MOCK_OPEN_ORDER.version + 1 }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, "CONFLICT");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("acceptOpenOrder returns error code 400 when the order is no longer open", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: MOCK_ACCEPTED_ORDER });

    await assert.rejects(
        () => acceptOpenOrder("stu_3", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            assert.equal(error.code, "BAD_REQUEST");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("acceptOpenOrder returns error code 403 when the requester tries to accept their own order", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: MOCK_OPEN_ORDER });

    await assert.rejects(
        () => acceptOpenOrder(MOCK_OPEN_ORDER.requesterId, MOCK_OPEN_ORDER.id, { expectedVersion: MOCK_OPEN_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 403);
            assert.equal(error.code, "FORBIDDEN");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("acceptOpenOrder returns error code 500 and skips the status history when the update fails", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_OPEN_ORDER,
        updateReturn: MOCK_OPEN_ORDER, // status update failed, thus the status remained the same
    });

    await assert.rejects(
        () => acceptOpenOrder("stu_2", MOCK_OPEN_ORDER.id, { expectedVersion: MOCK_OPEN_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // this update will be rolled back
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("acceptOpenOrder returns error code 500 and skips the status history when prisma update does not return", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_OPEN_ORDER,
        updateReturn: null,
    });

    await assert.rejects(
        () => acceptOpenOrder("stu_2", MOCK_OPEN_ORDER.id, { expectedVersion: MOCK_OPEN_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // this update will be rolled back in the transaction
    assert.equal(calls.orderStatusHistoryCreate, 0);
});


test("acceptOpenOrder returns error code 500 when the status history cannot be recorded", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_OPEN_ORDER,
        updateReturn: MOCK_ACCEPTED_ORDER,
        orderStatusHistoryCreateReturn: null,
    });

    await assert.rejects(
        () => acceptOpenOrder("stu_2", MOCK_OPEN_ORDER.id, { expectedVersion: MOCK_OPEN_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // this update will be rolled back in the transaction
    assert.equal(calls.orderStatusHistoryCreate, 1); // this create will be rolled back in the transaction
});

test("acceptOpenOrder executes successfully with a valid input", async (t) => {
    const orderStatusChange = {
        orderId: MOCK_OPEN_ORDER.id,
        fromStatus: MOCK_OPEN_ORDER.status,
        toStatus: MOCK_ACCEPTED_ORDER.status,
        changedBy: "stu_2"
    }

    const { prisma, calls, captured } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_OPEN_ORDER,
        updateReturn: MOCK_ACCEPTED_ORDER,
    });

    const result = await acceptOpenOrder("stu_2", MOCK_OPEN_ORDER.id, { expectedVersion: MOCK_OPEN_ORDER.version });

    // check arguments passed into prisma findUnique query
    assert.deepEqual(captured.findUniqueArgs, { where: { id: MOCK_OPEN_ORDER.id } });

    // check arguments passed into prisma update
    const updateArgs = captured.updateArgs as { where: Record<string, unknown>; data: Record<string, unknown> };
    assert.equal(updateArgs.where.id, MOCK_OPEN_ORDER.id);
    assert.equal(updateArgs.where.version, MOCK_OPEN_ORDER.version);
    assert.ok((updateArgs.where.expiryAt as { gt: Date }).gt instanceof Date);
    assert.equal(updateArgs.data.courierId, "stu_2");
    assert.equal(updateArgs.data.status, "ACCEPTED");
    assert.deepEqual(updateArgs.data.version, { increment: 1 });
    assert.ok(updateArgs.data.acceptedAt instanceof Date);

    // check arguments passed into prisma when creating orderStatusHistory row
    assert.deepEqual(captured.orderStatusHistoryCreateArgs, { data: orderStatusChange });

    // check result
    assert.deepEqual(result, MOCK_ACCEPTED_ORDER);

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1);
    assert.equal(calls.orderStatusHistoryCreate, 1);
    assert.equal(prisma.outboxEvent.create.mock.calls.length, 1);

    const event = prisma.outboxEvent.create.mock.calls[0]!.arguments[0] as {
        data: {
            eventType: string;
            orderId: string;
            payload: Record<string, unknown>;
        };
    };

    assert.equal(event.data.eventType, "ORDER_STATUS_CHANGED");
    assert.equal(event.data.orderId, MOCK_ACCEPTED_ORDER.id);
    assert.equal(event.data.payload.eventType, "ORDER_STATUS_CHANGED");
    assert.equal(event.data.payload.orderId, MOCK_ACCEPTED_ORDER.id);
    assert.equal(event.data.payload.orderName, MOCK_ACCEPTED_ORDER.name);
    assert.equal(event.data.payload.requesterId, MOCK_ACCEPTED_ORDER.requesterId);
    assert.equal(event.data.payload.courierId, MOCK_ACCEPTED_ORDER.courierId);
    assert.equal(event.data.payload.fromStatus, "OPEN");
    assert.equal(event.data.payload.toStatus, "ACCEPTED");
    assert.equal(event.data.payload.version, MOCK_ACCEPTED_ORDER.version);
    assert.equal(event.data.payload.offeredCredits, MOCK_ACCEPTED_ORDER.offeredCredits);
    assert.equal(typeof event.data.payload.eventId, "string");
    assert.equal(typeof event.data.payload.occurredAt, "string");
});

test("pickUpAcceptedOrder returns error code 404 when specified order id does not exist", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: null });

    await assert.rejects(
        () => pickUpAcceptedOrder("stu_2", "id_that_does_not_exist", { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 404);
            assert.equal(error.code, "NOT_FOUND");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("pickUpAcceptedOrder returns error code 403 when the caller is not the assigned courier", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: MOCK_ACCEPTED_ORDER });

    await assert.rejects(
        () => pickUpAcceptedOrder("stu_3", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 403);
            assert.equal(error.code, "FORBIDDEN");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("pickUpAcceptedOrder returns error code 400 when the order is not in the ACCEPTED stage", async (t) => {
    const order = { ...MOCK_ACCEPTED_ORDER, status: "PICKED_UP" };// status is not accepted
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: order });

    await assert.rejects(
        () => pickUpAcceptedOrder("stu_2", order.id, { expectedVersion: order.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            assert.equal(error.code, "BAD_REQUEST");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
});

test("pickUpAcceptedOrder returns error code 409 when the time stated in expiryAt has passed", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: { ...MOCK_ACCEPTED_ORDER, expiryAt: new Date(Date.now() - 1) },
    });

    await assert.rejects(
        () => pickUpAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, "CONFLICT");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("pickUpAcceptedOrder returns error code 409 when expected version is different", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_ACCEPTED_ORDER,
    });

    await assert.rejects(
        () => pickUpAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version + 1 }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, "CONFLICT");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("pickUpAcceptedOrder updates order status successfully with valid inputs", async (t) => {
    const orderStatusChange = {
        orderId: MOCK_ACCEPTED_ORDER.id,
        fromStatus: MOCK_ACCEPTED_ORDER.status,
        toStatus: MOCK_PICKED_UP_ORDER.status,
        changedBy: "stu_2"
    }

    const { prisma, calls, captured } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_ACCEPTED_ORDER,
        updateReturn: MOCK_PICKED_UP_ORDER,
    });

    const result = await pickUpAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version });

    // check arguments passed into prisma findUnique query
    assert.deepEqual(captured.findUniqueArgs, { where: { id: MOCK_ACCEPTED_ORDER.id } });

    // check arguments passed into prisma update
    const updateArgs = captured.updateArgs as { where: Record<string, unknown>; data: Record<string, unknown> };
    assert.equal(updateArgs.where.id, MOCK_ACCEPTED_ORDER.id);
    assert.equal(updateArgs.where.version, MOCK_ACCEPTED_ORDER.version);
    assert.equal(updateArgs.data.status, "PICKED_UP");
    assert.deepEqual(updateArgs.data.version, { increment: 1 });
    assert.ok(updateArgs.data.pickedUpAt instanceof Date);

    // check arguments passed into prisma when creating orderStatusHistory row
    assert.deepEqual(captured.orderStatusHistoryCreateArgs, { data: orderStatusChange });

    // check result
    assert.deepEqual(result, MOCK_PICKED_UP_ORDER);

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1);
    assert.equal(calls.orderStatusHistoryCreate, 1);
    assert.equal(prisma.outboxEvent.create.mock.calls.length, 1);

    const event = prisma.outboxEvent.create.mock.calls[0]!.arguments[0] as {
        data: {
            eventType: string;
            orderId: string;
            payload: Record<string, unknown>;
        };
    };

    assert.equal(event.data.eventType, "ORDER_STATUS_CHANGED");
    assert.equal(event.data.orderId, MOCK_PICKED_UP_ORDER.id);
    assert.equal(event.data.payload.eventType, "ORDER_STATUS_CHANGED");
    assert.equal(event.data.payload.orderId, MOCK_PICKED_UP_ORDER.id);
    assert.equal(event.data.payload.orderName, MOCK_PICKED_UP_ORDER.name);
    assert.equal(event.data.payload.requesterId, MOCK_PICKED_UP_ORDER.requesterId);
    assert.equal(event.data.payload.courierId, MOCK_PICKED_UP_ORDER.courierId);
    assert.equal(event.data.payload.fromStatus, "ACCEPTED");
    assert.equal(event.data.payload.toStatus, "PICKED_UP");
    assert.equal(event.data.payload.version, MOCK_PICKED_UP_ORDER.version);
    assert.equal(event.data.payload.offeredCredits, MOCK_PICKED_UP_ORDER.offeredCredits);
    assert.equal(typeof event.data.payload.eventId, "string");
    assert.equal(typeof event.data.payload.occurredAt, "string");
});

test("pickUpAcceptedOrder returns error code 500 and skips the status history when the update fails", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_ACCEPTED_ORDER,
        updateReturn: MOCK_ACCEPTED_ORDER // status update failed, thus the status remained the same,
    });

    await assert.rejects(
        () => pickUpAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // this update will be rolled back in the transaction
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("pickUpAcceptedOrder returns error code 500 and skips the status history when prisma update returns null", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_ACCEPTED_ORDER,
        updateReturn: null
    });

    await assert.rejects(
        () => pickUpAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // this update will be rolled back in the transaction
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("pickUpAcceptedOrder returns error code 500 when the status history cannot be recorded", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_ACCEPTED_ORDER,
        updateReturn: MOCK_PICKED_UP_ORDER,
        orderStatusHistoryCreateReturn: null,
    });

    await assert.rejects(
        () => pickUpAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // this update will be rolled back in the transaction
    assert.equal(calls.orderStatusHistoryCreate, 1); // this create is rolled back in the transaction
});

test("completePickedUpOrder returns error code 404 when the specified order id does not exist", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: null });

    await assert.rejects(
        () => completePickedUpOrder("stu_2", "id_that_does_not_exist", { expectedVersion: MOCK_PICKED_UP_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 404);
            assert.equal(error.code, "NOT_FOUND");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("completePickedUpOrder returns error code 409 when the time stated in expiryAt has passed", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: { ...MOCK_PICKED_UP_ORDER, expiryAt: new Date(Date.now() - 1) },
    });

    await assert.rejects(
        () => completePickedUpOrder("stu_2", MOCK_PICKED_UP_ORDER.id, { expectedVersion: MOCK_PICKED_UP_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, "CONFLICT");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("completePickedUpOrder returns error code 409 when expected version is different", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_PICKED_UP_ORDER,
    });

    await assert.rejects(
        () => completePickedUpOrder("stu_2", MOCK_PICKED_UP_ORDER.id, { expectedVersion: MOCK_PICKED_UP_ORDER.version + 1 }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, "CONFLICT");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("completePickedUpOrder returns error code 403 when the caller is not the assigned courier", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: MOCK_PICKED_UP_ORDER });

    await assert.rejects(
        () => completePickedUpOrder("stu_3", MOCK_PICKED_UP_ORDER.id, { expectedVersion: MOCK_PICKED_UP_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 403);
            assert.equal(error.code, "FORBIDDEN");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("completePickedUpOrder returns error code 400 when the order is not in the PICKED_UP stage", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: MOCK_ACCEPTED_ORDER }); // status order is not yet advanced to PICKED_UP

    await assert.rejects(
        () => completePickedUpOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            assert.equal(error.code, "BAD_REQUEST");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
});

test("completePickedUpOrder updates order status successfully with valid inputs", async (t) => {
    const orderStatusChange = {
        orderId: MOCK_PICKED_UP_ORDER.id,
        fromStatus: MOCK_PICKED_UP_ORDER.status,
        toStatus: MOCK_COMPLETED_ORDER.status,
        changedBy: "stu_2"
    }

    const { prisma, calls, captured } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_PICKED_UP_ORDER,
        updateReturn: MOCK_COMPLETED_ORDER,
    });

    const result = await completePickedUpOrder("stu_2", MOCK_PICKED_UP_ORDER.id, { expectedVersion: MOCK_PICKED_UP_ORDER.version });

    // check arguments passed into prisma findUnique query
    assert.deepEqual(captured.findUniqueArgs, { where: { id: MOCK_PICKED_UP_ORDER.id } });

    // check arguments passed into prisma update
    const updateArgs = captured.updateArgs as { where: Record<string, unknown>; data: Record<string, unknown> };
    assert.equal(updateArgs.where.id, MOCK_PICKED_UP_ORDER.id);
    assert.equal(updateArgs.where.version, MOCK_PICKED_UP_ORDER.version);
    assert.equal(updateArgs.data.status, "COMPLETED");
    assert.deepEqual(updateArgs.data.version, { increment: 1 });
    assert.ok(updateArgs.data.completedAt instanceof Date);

    // check arguments passed into prisma when creating orderStatusHistory row
    assert.deepEqual(captured.orderStatusHistoryCreateArgs, { data: orderStatusChange });

    // check result
    assert.deepEqual(result, MOCK_COMPLETED_ORDER);

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1);
    assert.equal(calls.orderStatusHistoryCreate, 1);
    assert.equal(prisma.outboxEvent.create.mock.calls.length, 1);

    const event = prisma.outboxEvent.create.mock.calls[0]!.arguments[0] as {
        data: {
            eventType: string;
            orderId: string;
            payload: Record<string, unknown>;
        };
    };

    assert.equal(event.data.eventType, "ORDER_STATUS_CHANGED");
    assert.equal(event.data.orderId, MOCK_COMPLETED_ORDER.id);
    assert.equal(event.data.payload.fromStatus, "PICKED_UP");
    assert.equal(event.data.payload.toStatus, "COMPLETED");
    assert.equal(event.data.payload.version, MOCK_COMPLETED_ORDER.version);
    assert.equal(event.data.payload.requesterId, MOCK_COMPLETED_ORDER.requesterId);
    assert.equal(event.data.payload.courierId, MOCK_COMPLETED_ORDER.courierId);
    assert.equal(event.data.payload.orderName, MOCK_COMPLETED_ORDER.name);
    assert.equal(event.data.payload.offeredCredits, MOCK_COMPLETED_ORDER.offeredCredits);
    assert.equal(typeof event.data.payload.eventId, "string");
    assert.equal(typeof event.data.payload.occurredAt, "string");
});

test("completePickedUpOrder returns error code 500 and skips the status history when the update fails", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_PICKED_UP_ORDER,
        updateReturn: MOCK_PICKED_UP_ORDER // order status not changed
    });

    await assert.rejects(
        () => completePickedUpOrder("stu_2", MOCK_PICKED_UP_ORDER.id, { expectedVersion: MOCK_PICKED_UP_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // this update will be rolled back in the transaction
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("completePickedUpOrder returns error code 500 and skips the status history when prisma update returns null", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_PICKED_UP_ORDER,
        updateReturn: null
    });

    await assert.rejects(
        () => completePickedUpOrder("stu_2", MOCK_PICKED_UP_ORDER.id, { expectedVersion: MOCK_PICKED_UP_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // this update will be rolled back in the transaction
    assert.equal(calls.orderStatusHistoryCreate, 0);
});


test("completePickedUpOrder returns error code 500 when the status history cannot be recorded", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_PICKED_UP_ORDER,
        updateReturn: MOCK_COMPLETED_ORDER,
        orderStatusHistoryCreateReturn: null,
    });

    await assert.rejects(
        () => completePickedUpOrder("stu_2", MOCK_PICKED_UP_ORDER.id, { expectedVersion: MOCK_PICKED_UP_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // this update will be rolled back in the transaction
    assert.equal(calls.orderStatusHistoryCreate, 1); // this create is rolled back in the transaction
});

test("dropAcceptedOrder returns error code 404 when the specified order id does not exist", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: null });

    await assert.rejects(
        () => dropAcceptedOrder("stu_2", "id_that_does_not_exist", { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 404);
            assert.equal(error.code, "NOT_FOUND");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("dropAcceptedOrder returns error code 403 when the caller is not the assigned courier", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: MOCK_ACCEPTED_ORDER });

    await assert.rejects(
        () => dropAcceptedOrder("stu_3", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 403);
            assert.equal(error.code, "FORBIDDEN");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("dropAcceptedOrder returns error code 400 when the order is not in the ACCEPTED stage", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findUniqueReturn: MOCK_PICKED_UP_ORDER }); // already in picked up status

    await assert.rejects(
        () => dropAcceptedOrder("stu_2", MOCK_PICKED_UP_ORDER.id, { expectedVersion: MOCK_PICKED_UP_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            assert.equal(error.code, "BAD_REQUEST");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("dropAcceptedOrder returns error code 409 when the time stated in expiryAt has passed", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: { ...MOCK_ACCEPTED_ORDER, expiryAt: new Date(Date.now() - 1) },
    });

    await assert.rejects(
        () => dropAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, "CONFLICT");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("dropAcceptedOrder returns error code 409 when expected version is different", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_ACCEPTED_ORDER,
    });

    await assert.rejects(
        () => dropAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version + 1 }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            assert.equal(error.code, "CONFLICT");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 0);
    assert.equal(calls.update, 0);
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("dropAcceptedOrder returns error code 500 and skips the status history when the update fails", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_ACCEPTED_ORDER,
        updateReturn: MOCK_ACCEPTED_ORDER // order status did not change
    });

    await assert.rejects(
        () => dropAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // update will be rolled back
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("dropAcceptedOrder returns error code 500 and skips the status history when prisma update returns null", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_ACCEPTED_ORDER,
        updateReturn: null // order status did not change
    });

    await assert.rejects(
        () => dropAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // update will be rolled back
    assert.equal(calls.orderStatusHistoryCreate, 0);
});

test("dropAcceptedOrder returns error code 500 and skips the order status history is not recorded", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_ACCEPTED_ORDER,
        updateReturn: { ...MOCK_OPEN_ORDER, version: 3 },
        orderStatusHistoryCreateReturn: null
    });

    await assert.rejects(
        () => dropAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 500);
            assert.equal(error.code, "INTERNAL_SERVER_ERROR");
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1); // update will be rolled back
    assert.equal(calls.orderStatusHistoryCreate, 1); // create will be rolled back
});

test("dropAcceptedOrder executes successfully with valid inputs", async (t) => {
    const orderStatusChange = {
        orderId: MOCK_ACCEPTED_ORDER.id,
        fromStatus: MOCK_ACCEPTED_ORDER.status,
        toStatus: MOCK_OPEN_ORDER.status,
        changedBy: "stu_2"
    }

    const { prisma, calls, captured } = useSharedMockPrisma(t, {
        findUniqueReturn: MOCK_ACCEPTED_ORDER,
        updateReturn: { ...MOCK_OPEN_ORDER, version: 3 }
    });

    const result = await dropAcceptedOrder("stu_2", MOCK_ACCEPTED_ORDER.id, { expectedVersion: MOCK_ACCEPTED_ORDER.version });

    // check arguments passed into prisma findUnique query
    assert.deepEqual(captured.findUniqueArgs, { where: { id: MOCK_ACCEPTED_ORDER.id } });

    // check arguments passed into prisma update
    const updateArgs = captured.updateArgs as { where: Record<string, unknown>; data: Record<string, unknown> };
    assert.equal(updateArgs.where.id, MOCK_ACCEPTED_ORDER.id);
    assert.equal(updateArgs.where.version, MOCK_ACCEPTED_ORDER.version);
    assert.equal(updateArgs.data.status, "OPEN");
    assert.deepEqual(updateArgs.data.version, { increment: 1 });

    // check arguments passed into prisma when creating orderStatusHistory row
    assert.deepEqual(captured.orderStatusHistoryCreateArgs, { data: orderStatusChange });

    // check result
    assert.deepEqual(result, { ...MOCK_OPEN_ORDER, version: 3 });

    // check number of calls
    assert.equal(calls.findUnique, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.update, 1);
    assert.equal(calls.orderStatusHistoryCreate, 1);
    assert.equal(prisma.outboxEvent.create.mock.calls.length, 1);

    const event = prisma.outboxEvent.create.mock.calls[0]!.arguments[0] as {
        data: {
            eventType: string;
            orderId: string;
            payload: Record<string, unknown>;
        };
    };

    assert.equal(event.data.eventType, "ORDER_STATUS_CHANGED");
    assert.equal(event.data.orderId, MOCK_OPEN_ORDER.id);
    assert.equal(event.data.payload.fromStatus, "ACCEPTED");
    assert.equal(event.data.payload.toStatus, "OPEN");
    assert.equal(event.data.payload.version, 3);
    assert.equal(event.data.payload.courierId, null);
    assert.equal(typeof event.data.payload.eventId, "string");
    assert.equal(typeof event.data.payload.occurredAt, "string");
});

test("getCourierAcceptanceHistory returns orders with default values and no status specified", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: [MOCK_ACCEPTED_ORDER, MOCK_PICKED_UP_ORDER],
        countReturn: 2,
    });

    const result = await getCourierAcceptanceHistory("stu_2", VALID_DEFAULT_COURIER_ACCEPTANCE_INPUT);

    // check arguments passed into prisma findMany query
    const findManyArgs = captured.findManyArgs as { where: Record<string, unknown>; orderBy: unknown; take: number; skip: number };
    assert.equal(findManyArgs.where.status, undefined); // no status passed in
    assert.deepEqual(findManyArgs.orderBy, { acceptedAt: "desc" });
    assert.equal(findManyArgs.take, 15);
    assert.equal(findManyArgs.skip, 0);

    // check arguments passed into prisma count query
    const countArgs = captured.countArgs as { where: Record<string, unknown> };
    assert.deepEqual(countArgs.where, findManyArgs.where);

    // check results
    assert.deepEqual(result.orders, [MOCK_ACCEPTED_ORDER, MOCK_PICKED_UP_ORDER]);
    assert.deepEqual(result.pagination, { limit: 15, page: 1, totalCount: 2, totalPages: 1 });

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("getCourierAcceptanceHistory uses page offset and status filters specified", async (t) => {
    const input: GetCourierOrderHistoryInput = { ...VALID_DEFAULT_COURIER_ACCEPTANCE_INPUT, page: 2, status: "ACCEPTED" }

    const { calls, captured } = useSharedMockPrisma(t, { findManyReturn: [MOCK_ACCEPTED_ORDER], countReturn: 16 });

    const result = await getCourierAcceptanceHistory("stu_2", input);

    // check arguments passed into prisma findMany query
    const findManyArgs = captured.findManyArgs as { where: Record<string, unknown>; orderBy: unknown; take: number; skip: number };
    assert.equal(findManyArgs.where.status, input.status);
    assert.deepEqual(findManyArgs.orderBy, { acceptedAt: "desc" });
    assert.equal(findManyArgs.take, 15);
    assert.equal(findManyArgs.skip, 15); // use page 2

    // check arguments passed into prisma count query
    const countArgs = captured.countArgs as { where: Record<string, unknown> };
    assert.deepEqual(countArgs.where, findManyArgs.where);

    // check results
    assert.deepEqual(result.orders, [MOCK_ACCEPTED_ORDER]);
    assert.deepEqual(result.pagination, { limit: 15, page: 2, totalCount: 16, totalPages: 2 });

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("getCourierAcceptanceHistory returns error code 400 when prisma's findMany returns no result", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findManyReturn: null });

    await assert.rejects(
        () => getCourierAcceptanceHistory("stu_2", VALID_DEFAULT_COURIER_ACCEPTANCE_INPUT),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            return true;
        },
    );

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1); // error is thrown after the count call is made
});
