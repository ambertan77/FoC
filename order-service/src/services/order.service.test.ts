import test from "node:test";
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";
import { prisma as sharedPrisma } from "../libs/prisma.js";
import { getAllOrders } from "./order.service.js";
import type { GetAllOrdersInput } from "../schemas/order.schema.js"
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

const MOCK_EXPIRED_ORDER = { ...MOCK_ACCEPTED_ORDER, status: "EXPIRED", version: 3, expiredAt: now };

const VALID_INPUT: GetAllOrdersInput = {
    // optional fields are not filled in
    page: 1, 
    sortBy: "createdAt", // default value
    sortOrder: "desc" // default value
}   

const PAGE_LIMIT = 15;

interface MockConfig {
    findManyReturn?: unknown[] | null;
    countReturn?: number;
}

function createMockPrisma(config: MockConfig = {}) {
    const calls = {
        findMany: 0,
        count: 0,
    };

    const captured = {
        findManyArgs: undefined as unknown,
        countArgs: undefined as unknown,
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
        }
    };

    return { prisma, calls, captured };
}

// use the mock order and orderStatusHistory tables and $transaction when running the test, instead of the actual shared prisma client
function useSharedMockPrisma(t: TestContext, config: MockConfig = {}) {
    const mocked = createMockPrisma(config); // build a mock prisma client
    const originalOrder = sharedPrisma.order;

    // point sharedPrisma.order to the mock db so that tested functions query/write to the fake order table, instead of the real database
    Object.defineProperty(sharedPrisma, "order", {
        value: mocked.prisma.order,
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
    });

    return mocked;
}

test("getAllOrders returns open orders with pagination when no filters are given", async (t) => {
    const expectedResult = [MOCK_OPEN_ORDER, MOCK_ACCEPTED_ORDER, MOCK_EXPIRED_ORDER];

    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: expectedResult,
        countReturn: expectedResult.length,
    });

    const result = await getAllOrders(VALID_INPUT);

    // check arguments passed into prisma findMany query
    const findManyArgs = captured.findManyArgs as { where: Record<string, unknown>; orderBy: unknown; take: number; skip: number };
    assert.deepEqual(findManyArgs.where.name, { contains: "", mode: "insensitive" });
    assert.equal(findManyArgs.where.status, undefined);
    assert.equal(findManyArgs.where.OR, undefined); // no location filter
    assert.deepEqual(findManyArgs.orderBy, { createdAt: "desc" });
    assert.equal(findManyArgs.take, PAGE_LIMIT);
    assert.equal(findManyArgs.skip, Math.floor(expectedResult.length / PAGE_LIMIT) * PAGE_LIMIT);

    // check arguments passed into prisma count query
    const countArgs = captured.countArgs as { where: Record<string, unknown> };
    assert.deepEqual(countArgs.where, findManyArgs.where);

    // check result obtained
    assert.deepEqual(result.orders, expectedResult);
    assert.deepEqual(result.pagination, { limit: PAGE_LIMIT, page: 1, totalCount: 3, totalPages: 1 });

    // check number of calls
    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("getAllOrders applies the search string, location filter, sorting and page offset", async (t) => {
    const startDateInput = new Date("2026-11-01T00:00:00.000+08:00");
    const endDateInput = new Date("2026-11-30T23:59:59.999+08:00");

    const input: GetAllOrdersInput = { 
        page: 2, 
        statuses: ["OPEN"], 
        sortBy: "expiryAt", 
        sortOrder: "asc", 
        filterLocation: "sup_1", 
        searchString: "coffee",
        startDate: startDateInput,
        endDate: endDateInput
    };
    
    const { calls, captured } = useSharedMockPrisma(t, { findManyReturn: [MOCK_OPEN_ORDER], countReturn: 16 });

    const result = await getAllOrders(input);

    // check arguments passed into prisma findMany query
    const findManyArgs = captured.findManyArgs as { where: Record<string, unknown>; orderBy: unknown; take: number; skip: number };
    assert.deepEqual(findManyArgs.where.name, { contains: "coffee", mode: "insensitive" });
    assert.deepEqual(findManyArgs.where.status, { in: ["OPEN"]});
    assert.deepEqual(findManyArgs.where.OR, [{ deliverySupplierId: "sup_1" }, { pickupSupplierId: "sup_1" }]);
    assert.deepEqual(findManyArgs.orderBy, { expiryAt: "asc" });
    assert.deepEqual(findManyArgs.where.createdAt, { gte: startDateInput, lte: endDateInput });
    assert.equal(findManyArgs.take, PAGE_LIMIT);
    assert.equal(findManyArgs.skip, Math.floor(16 / PAGE_LIMIT) * PAGE_LIMIT);

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

test("getAllOrders returns empty array when there are no records found", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: [],
        countReturn: 0,
    });

    const result = await getAllOrders(VALID_INPUT);

    // check arguments passed into prisma findMany query
    const findManyArgs = captured.findManyArgs as { where: Record<string, unknown>; orderBy: unknown; take: number; skip: number };
    assert.deepEqual(findManyArgs.where.name, { contains: "", mode: "insensitive" });
    assert.equal(findManyArgs.where.OR, undefined); // no location filter
    assert.deepEqual(findManyArgs.orderBy, { createdAt: "desc" });
    assert.equal(findManyArgs.take, PAGE_LIMIT);
    assert.equal(findManyArgs.skip, Math.floor(0 / PAGE_LIMIT) * PAGE_LIMIT);

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

test("getAllOrders returns error code 400 when Prisma returns null", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findManyReturn: null });

    await assert.rejects(
        () => getAllOrders(VALID_INPUT),
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
