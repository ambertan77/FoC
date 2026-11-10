// AI Assistance Disclosure:
// Tool: Claude Code (Opus 5.5)
// Date: 2026-10-28
// Scope: Generated boilerplate code for setting up mock Prisma and unit testing for all functions related to supplier types.
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import test from "node:test";
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";
import { prisma as sharedPrisma } from "../libs/prisma.js";
import {
    countForEachType,
    createType,
    deleteType,
    fetchSupplierTypes,
} from "./supplier.type.service.js";
import { AppError } from "../errors/errors.js";

const now: Date = new Date();

const MOCK_TYPE_1 = {
    id: "t1",
    type: "FOOD",
    createdAt: now,
    updatedAt: now,
};

const MOCK_TYPE_2 = {
    id: "t2",
    type: "RETAIL",
    createdAt: now,
    updatedAt: now,
};

const MOCK_SUPPLIER = {
    id: "sup_1",
    name: "Starbucks",
    type: "FOOD",
    status: "ACTIVATED",
    building: "Engineering Building",
    floor: "1",
    description: "Coffee and pastries",
    address: "4 Engineering Road",
    latitude: 1.3,
    longitude: 103.77,
    imageUrl: null,
    openingHours: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

interface MockConfig {
    findManyReturn?: unknown[];
    findFirstReturn?: unknown | null;
    upsertReturn?: unknown;
    deleteReturn?: unknown;
    supplierFindManyReturn?: unknown[];
}

function createMockPrisma(config: MockConfig = {}) {
    const calls = {
        findMany: 0,
        findFirst: 0,
        upsert: 0,
        delete: 0,
        supplierFindMany: 0,
    };

    const captured = {
        findManyArgs: undefined as unknown,
        findFirstArgs: undefined as unknown,
        upsertArgs: undefined as unknown,
        deleteArgs: undefined as unknown,
        supplierFindManyArgs: undefined as unknown,
    };

    const prisma = {
        supplierType: {
            findMany: mock.fn(async (args: unknown) => {
                calls.findMany++;
                captured.findManyArgs = args;
                return config.findManyReturn ?? [];
            }),
            findFirst: mock.fn(async (args: unknown) => {
                calls.findFirst++;
                captured.findFirstArgs = args;
                return config.findFirstReturn ?? null;
            }),
            upsert: mock.fn(async (args: unknown) => {
                calls.upsert++;
                captured.upsertArgs = args;
                return config.upsertReturn ?? {};
            }),
            delete: mock.fn(async (args: unknown) => {
                calls.delete++;
                captured.deleteArgs = args;
                return config.deleteReturn ?? {};
            }),
        },
        supplier: {
            findMany: mock.fn(async (args: unknown) => {
                calls.supplierFindMany++;
                captured.supplierFindManyArgs = args;
                return config.supplierFindManyReturn ?? [];
            }),
        },
    };

    return { prisma, calls, captured };
}

// use the mock supplier and supplierType table when running the test, instead of the actual shared prisma client
function useSharedMockPrisma(t: TestContext, config: MockConfig = {}) {
    const mocked = createMockPrisma(config); // build a mock prisma client
    const originalSupplier = sharedPrisma.supplier; // real supplier table that needs to be put back after the test
    const originalSupplierType = sharedPrisma.supplierType; // real supplierType table that needs to be put back after the test

    // point sharedPrisma.supplier to the mock db so that tested functions query/write to the fake supplier table, instead of the real database
    Object.defineProperty(sharedPrisma, "supplier", {
        value: mocked.prisma.supplier,
        configurable: true, // allows the property to be redefined again in t.after below
        writable: true,
    });

    // point sharedPrisma.supplierType to the mock db so that tested functions query/write to the fake supplierType table, instead of the real database
    Object.defineProperty(sharedPrisma, "supplierType", {
        value: mocked.prisma.supplierType,
        configurable: true, // allows the property to be redefined again in t.after below
        writable: true,
    });

    // always put the real supplier and supplierType table back after a test ends, even if an assertion fails
    t.after(() => {
        Object.defineProperty(sharedPrisma, "supplier", {
            value: originalSupplier,
            configurable: true,
            writable: true,
        });
        Object.defineProperty(sharedPrisma, "supplierType", {
            value: originalSupplierType,
            configurable: true,
            writable: true,
        });
    });

    return mocked;
}

test("fetchSupplierTypes returns all supplier types in sorted order (of name)", async (t) => {
    const expectedResult = [MOCK_TYPE_1, MOCK_TYPE_2];
    const { calls, captured } = useSharedMockPrisma(t, { findManyReturn: expectedResult });

    const result = await fetchSupplierTypes();

    // check arguments passed into prisma query
    const expectedArgs = {
        orderBy: { type: 'asc' }
    }; // line 7 of supplier.type.service.ts
    assert.deepEqual(captured.findManyArgs, expectedArgs);

    // check result obtained
    assert.deepEqual(result, expectedResult);

    // check number of calls
    assert.equal(calls.findMany, 1);
});

test("fetchSupplierTypes returns an empty array when there are no types", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, { findManyReturn: [] });

    const result = await fetchSupplierTypes();

    // check arguments passed into prisma query
    const expectedArgs = {
        orderBy: { type: 'asc' }
    }; // line 7 of supplier.type.service.ts
    assert.deepEqual(captured.findManyArgs, expectedArgs);

    // check result obtained
    assert.deepEqual(result, []);

    // check number of calls
    assert.equal(calls.findMany, 1);
});

test("countForEachType returns the number of suppliers for each type", async (t) => {
    // Prisma will return an object with attributes id, type and _count
    const expectedPrismaResult = [
        { id: "type_1", type: "FOOD", _count: { suppliers: 3 } },
        { id: "type_2", type: "RETAIL", _count: { suppliers: 0 } }
    ];

    // each _count attribute in the prisma result is mapped to count (which stores _count.suppliers)
    const expectedFunctionResult = expectedPrismaResult.map(({ id, type, _count }) => ({
        id,
        type,
        count: _count.suppliers,
    }));

    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: expectedPrismaResult,
    });

    const result = await countForEachType();

    // check arguments passed into prisma query
    const expectedArgs = {
        select: { id: true, type: true, _count: { select: { suppliers: true } } }
    }; // line 15 of supplier.type.service.ts
    assert.deepEqual(captured.findManyArgs, expectedArgs);

    // check result obtained
    assert.deepEqual(result, expectedFunctionResult);

    // check number of calls
    assert.equal(calls.findMany, 1);
});

test("countForEachType returns an empty array when there are no types", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, { findManyReturn: [] });

    const result = await countForEachType();

    // check arguments passed into prisma query
    const expectedArgs = {
        select: { id: true, type: true, _count: { select: { suppliers: true } } }
    }; // line 15 of supplier.type.service.ts
    assert.deepEqual(captured.findManyArgs, expectedArgs);

    // check result obtained
    assert.deepEqual(result, []);

    // check number of calls
    assert.equal(calls.findMany, 1);
});

test("createType creates a new type when it does not exist", async (t) => {
    const newType = { ...MOCK_TYPE_1, id: "t3", type: "FACILITIES" };

    const { calls, captured } = useSharedMockPrisma(t, {
        findFirstReturn: null, // prisma returns null if no match is found
        upsertReturn: newType,
    });

    const result = await createType(newType.type);

    // check arguments passed into prisma query
    const findFirstExpectedArgs = {
        where: {
            type: {
                equals: newType.type,
                mode: 'insensitive',
            }
        }
    }; // line 27-34 of supplier.type.service.ts
    assert.deepEqual(captured.findFirstArgs, findFirstExpectedArgs);
    const upsertExpectedArgs = {
        where: {
            type: newType.type,
        },
        create: {
            type: newType.type,
        },
        update: {}
    }; // line 40-48 of supplier.type.service.ts
    assert.deepEqual(captured.upsertArgs, upsertExpectedArgs);

    // check result obtained
    assert.deepEqual(result, newType);

    // check number of calls
    assert.equal(calls.findFirst, 1);
    assert.equal(calls.upsert, 1);
});

test("createType does not create new type if the case-insensitive name already exists", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findFirstReturn: MOCK_TYPE_1,
    });

    // check if function throws an error
    await assert.rejects(
        () => createType("Food"), // case-insensitive match to MOCK_TYPE_1
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            assert.equal(error.code, "BAD_REQUEST");
            return true;
        },
    );

    // check arguments passed into prisma query
    const findFirstExpectedArgs = {
        where: {
            type: {
                equals: "Food",
                mode: 'insensitive',
            }
        }
    }; // line 27-34 of supplier.type.service.ts
    assert.deepEqual(captured.findFirstArgs, findFirstExpectedArgs);

    // check number of calls
    assert.equal(calls.findFirst, 1);
    assert.equal(calls.upsert, 0);
});

test("deleteType deletes a type with no associated suppliers", async (t) => {
    const inputTypeId = MOCK_TYPE_2.id;
    const { calls, captured } = useSharedMockPrisma(t, {
        findFirstReturn: MOCK_TYPE_2,
        supplierFindManyReturn: [],
        deleteReturn: MOCK_TYPE_2,
    });

    const result = await deleteType(inputTypeId);

    // check arguments passed into prisma query
    const findFirstExpectedArgs = {
        where: { id: inputTypeId },
    }; // line 57 of supplier.type.service.ts
    assert.deepEqual(captured.findFirstArgs, findFirstExpectedArgs);
    const supplierFindManyExpectedArgs = {
        where: { type: MOCK_TYPE_2.type },
    }; // line 66 of supplier.type.service.ts
    assert.deepEqual(captured.supplierFindManyArgs, supplierFindManyExpectedArgs);
    const deleteExpectedArgs = {
        where: { id: inputTypeId }
    }; // line 57 of supplier.type.service.ts
    assert.deepEqual(captured.deleteArgs, deleteExpectedArgs);

    // check result obtained
    assert.deepEqual(result, MOCK_TYPE_2);

    // check number of calls
    assert.equal(calls.findFirst, 1);
    assert.equal(calls.supplierFindMany, 1);
    assert.equal(calls.delete, 1);
});

test("deleteType fails when the typeId passed in does not exist", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, { findFirstReturn: null });

    // check function fails
    await assert.rejects(
        () => deleteType("t67"),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 404);
            assert.equal(error.code, "NOT_FOUND");
            return true;
        },
    );

    // check arguments passed into prisma query
    const findFirstExpectedArgs = {
        where: { id: "t67" },
    }; // line 57 of supplier.type.service.ts
    assert.deepEqual(captured.findFirstArgs, findFirstExpectedArgs);

    // check number of calls
    assert.equal(calls.findFirst, 1);
    assert.equal(calls.supplierFindMany, 0);
    assert.equal(calls.delete, 0);
});

test("deleteType fails when the type passed in has associated suppliers", async (t) => {
    const inputTypeId = MOCK_TYPE_1.id;
    const inputType = MOCK_TYPE_1.type;
    const { calls, captured } = useSharedMockPrisma(t, {
        findFirstReturn: MOCK_TYPE_1,
        supplierFindManyReturn: [MOCK_SUPPLIER],
    });

    // check function fails
    await assert.rejects(
        () => deleteType(inputTypeId),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 403);
            assert.equal(error.code, "FORBIDDEN"); 
            return true;
        },
    );

    // check arguments passed into prisma query
    const findFirstExpectedArgs = {
        where: { id: inputTypeId },
    }; // line 57 of supplier.type.service.ts
    assert.deepEqual(captured.findFirstArgs, findFirstExpectedArgs);
    const supplierFindManyExpectedArgs = {
        where: { type: inputType },
    }; // line 66 of supplier.type.service.ts
    assert.deepEqual(captured.supplierFindManyArgs, supplierFindManyExpectedArgs);

    // check number of calls
    assert.equal(calls.findFirst, 1);
    assert.equal(calls.supplierFindMany, 1);
    assert.equal(calls.delete, 0);
});
