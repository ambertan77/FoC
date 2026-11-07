import test from "node:test";
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";
import { AppError } from "../errors/errors.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { CreateSupplierInput } from "../schemas/supplier.schema.js";

mock.module("../libs/prisma.js", { namedExports: { prisma: {} } });
const { prisma: sharedPrisma } = await import("../libs/prisma.js");
const { 
    activateSupplier,
    createSupplier,
    deactivateSupplier,
    fetchActiveSuppliers,
    fetchAllSuppliers,
    getSupplierByIdService,
    getSuppliersByIdsService,
    updateSupplier
} = await import("./supplier.service.js");

type SupplierData = {
    name: string;
    type: string;
    status: string;
    latitude: number;
    floor: string;
    openingHours: {
        create: Array<{ day: string; openingTime: Date; closingTime: Date }>;
        deleteMany?: unknown;
    };
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

const validCreateInput: CreateSupplierInput = {
    name: "Starbucks",
    type: "FOOD",
    building: "Engineering Building",
    floor: "1",
    description: "Coffee and pastries",
    address: "4 Engineering Road",
    latitude: 1.3,
    longitude: 103.77,
    imageUrl: null,
    openingHours: [
        { day: "MONDAY", openingTime: "08:00", closingTime: "18:00" },
        { day: "TUESDAY", openingTime: "08:00", closingTime: "18:00" },
    ],
};

type FindManyArgs = {
    where: { status?: string; name: { contains: string }; type: { contains: string }};
    take?: number;
    skip?: number;
};

interface MockConfig {
    findManyReturn?: unknown[];
    countReturn?: number;
    supplierFindUnique?: unknown | null;
    typeFindUnique?: unknown | null;
    createReturn?: unknown;
    updateReturn?: unknown;
}

function createMockPrisma(config: MockConfig = {}) {
    const calls = {
        findMany: 0,
        count: 0,
        findUnique: 0,
        typeFindUnique: 0,
        create: 0,
        update: 0,
    };

    const captured = {
        typeFindUniqueArgs: undefined as unknown,
        createArgs: undefined as unknown,
        updateArgs: undefined as unknown,
        findUniqueArgs: undefined as unknown,
        findManyArgs: undefined as unknown,
        countArgs: undefined as unknown,
    };

    const prisma = {
        supplier: {
            findMany: mock.fn(async (args: unknown) => {
                captured.findManyArgs = args;
                calls.findMany++;
                captured.findManyArgs = args;
                return config.findManyReturn ?? [];
            }),
            findUnique: mock.fn(async (args: unknown) => {
                calls.findUnique++;
                captured.findUniqueArgs = args;
                return config.supplierFindUnique ?? null;
            }),
            count: mock.fn(async (args: unknown) => {
                calls.count++;
                captured.countArgs = args;
                return config.countReturn ?? 0;
            }),
            create: mock.fn(async (args: unknown) => {
                calls.create++;
                captured.createArgs = args;
                return config.createReturn ?? config.supplierFindUnique ?? {};
            }),
            update: mock.fn(async (args: unknown) => {
                calls.update++;
                captured.updateArgs = args;
                return config.updateReturn ?? config.supplierFindUnique ?? {};
            }),
        },
        supplierType: {
            findUnique: mock.fn(async (args: unknown) => {
                captured.typeFindUniqueArgs = args;
                calls.typeFindUnique++;
                return config.typeFindUnique ?? null;
            }),
        },
    };

    return { prisma: prisma as unknown as PrismaClient, calls, captured };
}

// fetchAllSuppliers and fetchActiveSuppliers use the shared Prisma client in libs/prisma.ts
// we need to use the mock supplier table when running the test
function useSharedMockPrisma(t: TestContext, config: MockConfig = {}) {
    const mocked = createMockPrisma(config); // build a mock prisma client
    const original = sharedPrisma.supplier; // real supplier table that needs to be put back after the test

    // point sharedPrisma.supplier to the mock db so that test functions query/write to the fake supplier table, instead of the real database
    Object.defineProperty(sharedPrisma, "supplier", {
        value: mocked.prisma.supplier,
        configurable: true, // allows the property to be redefined again in t.after below
        writable: true,
    });

    // always put the real supplier table back after a test ends, even if an assertion fails
    t.after(() => {
        Object.defineProperty(sharedPrisma, "supplier", {
            value: original,
            configurable: true,
            writable: true,
        });
    });

    return mocked;
}

test("fetchActiveSuppliers works when searchString and typeFilter are unspecified", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: [MOCK_SUPPLIER],
        countReturn: 31,
    });

    const result = await fetchActiveSuppliers(2);

    assert.deepEqual(result.suppliers, [MOCK_SUPPLIER]);
    assert.equal(result.paginated, true);
    assert.deepEqual(result.pagination, { limit: 15, page: 2, totalCount: 31, totalPages: 3 });

    const args = captured.findManyArgs as FindManyArgs;
    assert.equal(args.where.status, "ACTIVATED");
    assert.equal(args.take, 15);
    assert.equal(args.skip, 15);
    assert.equal((captured.countArgs as FindManyArgs).where.status, "ACTIVATED");

    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("fetchActiveSuppliers works when searchString and typeFilter are specified", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: [MOCK_SUPPLIER],
        countReturn: 15,
    });

    const result = await fetchActiveSuppliers(1, "starbucks", "FOOD");

    assert.deepEqual(result.suppliers, [MOCK_SUPPLIER]);
    assert.equal(result.paginated, true);
    assert.deepEqual(result.pagination, { limit: 15, page: 1, totalCount: 15, totalPages: 1 });

    const args = captured.findManyArgs as FindManyArgs;
    assert.equal(args.where.status, "ACTIVATED");
    assert.equal(args.where.name.contains, "starbucks");
    assert.equal(args.where.type.contains, "FOOD");
    assert.equal(args.take, 15);
    assert.equal((captured.countArgs as FindManyArgs).where.status, "ACTIVATED");

    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("fetchActiveSuppliers returns 400 when value in the page parameter > the totalPages count", async (t) => {
    // return no rows since page 5 > total number of pages possible
    const { calls, captured } = useSharedMockPrisma(t, { findManyReturn: [] });

    await assert.rejects(
        () => fetchActiveSuppliers(5),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            return true;
        },
    );

    // check if take = 15 and skip = 15 * 4 = 60 when we are querying page 5
    assert.equal((captured.findManyArgs as FindManyArgs).skip, 60); 

    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 0); // skips count since error is thrown before count
});

test("fetchActiveSuppliers returns 400 when there is no match", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findManyReturn: [] });

    await assert.rejects(
        () => fetchActiveSuppliers(1, "random_prefix", null),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            return true;
        },
    );

    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 0);
});

test("fetchAllSuppliers can execute even with no pagination and filters", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: [MOCK_SUPPLIER, { ...MOCK_SUPPLIER, id: "sup_2", status: "DEACTIVATED" }],
        countReturn: 2,
    });

    const result = await fetchAllSuppliers();
    const expectedPaginationResult = {
        limit: null,
        page: null,
        totalCount: 2,
        totalPages: null
    }; // no pagination used

    assert.equal(result.suppliers.length, 2);
    assert.equal(result.paginated, false);
    assert.deepEqual(result.pagination, expectedPaginationResult);

    const args = captured.findManyArgs as FindManyArgs;
    assert.equal(args.where.status, undefined); // finding suppliers of all statuses
    assert.equal(args.take, undefined); // no pagination
    assert.equal(args.skip, undefined); // no pagination

    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("fetchAllSuppliers can execute with pagination and filters used", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: [MOCK_SUPPLIER, { ...MOCK_SUPPLIER, id: "sup_2", status: "DEACTIVATED" }],
        countReturn: 2,
    });

    const result = await fetchAllSuppliers(1, "starbucks", "FOOD");
    const expectedPaginationResult = {
        limit: 15,
        page: 1,
        totalCount: 2,
        totalPages: 1
    }; // no pagination used

    assert.equal(result.suppliers.length, 2);
    assert.equal(result.paginated, true);
    assert.deepEqual(result.pagination, expectedPaginationResult);

    const args = captured.findManyArgs as FindManyArgs;
    assert.equal(args.where.status, undefined); // finding suppliers of all statuses
    assert.equal(args.where.name.contains, "starbucks");
    assert.equal(args.where.type.contains, "FOOD");
    assert.equal(args.take, 15); 
    assert.equal(args.skip, 0); 

    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("fetchAllSuppliers accepts typeFilter 'all' and returns all possible types", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: [MOCK_SUPPLIER],
        countReturn: 1,
    });

    await fetchAllSuppliers(1, null, "ALL"); // "all" should be case-insensitive

    assert.equal((captured.findManyArgs as FindManyArgs).where.type.contains, ""); // no type filter

    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 1);
});

test("fetchAllSuppliers returns 400 when value in the page parameter > the totalPages count", async (t) => {
    // return no rows since page 5 > total number of pages possible
    const { calls, captured } = useSharedMockPrisma(t, { findManyReturn: [] });

    await assert.rejects(
        () => fetchAllSuppliers(5),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            return true;
        },
    );

    // check if take = 15 and skip = 15 * 4 = 60 when we are querying page 5
    assert.equal((captured.findManyArgs as FindManyArgs).skip, 60); 

    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 0); // skips count since error is thrown before count
});

test("fetchAllSuppliers returns 400 when there is no match", async (t) => {
    const { calls } = useSharedMockPrisma(t, { findManyReturn: [] });

    await assert.rejects(
        () => fetchAllSuppliers(1, "random_prefix", "FOOD"),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            return true;
        },
    );

    assert.equal(calls.findMany, 1);
    assert.equal(calls.count, 0);
});

test("getSupplierByIdService returns a supplier with a matching id", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        supplierFindUnique: MOCK_SUPPLIER
    });

    const result = await getSupplierByIdService("sup_1"); 
    assert.deepEqual(result, MOCK_SUPPLIER);

    const args = captured.findUniqueArgs as { where: { id: string; status: string } };
    assert.equal(args.where.id, "sup_1");
    assert.equal(args.where.status, "ACTIVATED");

    assert.equal(calls.findUnique, 1);
});

test("getSupplierByIdService does not return a supplier if none match the given id", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        supplierFindUnique: null // Prisma returns null when there are no matches
    });

    const result = await getSupplierByIdService("sup_10");
    assert.equal(result, null); 

    const args = captured.findUniqueArgs as { where: { id: string; status: string } };
    assert.equal(args.where.id, "sup_10");
    assert.equal(args.where.status, "ACTIVATED");

    assert.equal(calls.findUnique, 1);
});

test("getSuppliersByIdsService returns a supplier with a matching id", async (t) => {
    const expectedResult = [
        { id: "sup_1", name: "Starbucks", type: "FOOD", status: "ACTIVATED" },
        { id: "sup_2", name: "A Hot Hideout", type: "FOOD", status: "ACTIVATED" },
    ];
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: expectedResult
    });

    const result = await getSuppliersByIdsService(["sup_1", "sup_2"]); 
    assert.deepEqual(result, expectedResult);

    const args = captured.findManyArgs as { 
        where: { id: { in: string[] } ; status: string },
        select: Record<string, boolean>; 
    };
    assert.deepEqual(args.where.id.in, ["sup_1", "sup_2"]);
    assert.deepEqual(args.select, { id: true, name: true, type: true, status: true });

    assert.equal(calls.findMany, 1);
});

test("getSuppliersByIdsService does not return a supplier if none match the given ids", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: [] // Prisma returns empty array when there are no matches
    });

    const result = await getSuppliersByIdsService(["sup_10"]);

    assert.deepEqual(result, []); 

    const args = captured.findManyArgs as { 
        where: { id: { in: string[] } ; status: string },
        select: Record<string, boolean>; 
    };
    assert.deepEqual(args.where.id.in, ["sup_10"]);
    assert.deepEqual(args.select, { id: true, name: true, type: true, status: true });

    assert.equal(calls.findMany, 1);
});

test("getSuppliersByIdsService returns one supplier when duplicate ids are passed in", async (t) => {
    const expectedResult = [{ id: "sup_1", "name": "Starbucks", type: "FOOD", status: "ACTIVATED" }];
    
    const { calls, captured } = useSharedMockPrisma(t, {
        findManyReturn: expectedResult 
    });

    const result = await getSuppliersByIdsService(["sup_1", "sup_1"]);
    assert.deepEqual(result, expectedResult); 

    const args = captured.findManyArgs as { 
        where: { id: { in: string[] } ; status: string },
        select: Record<string, boolean>; 
    };
    assert.deepEqual(args.where.id.in, ["sup_1"]);

    assert.equal(calls.findMany, 1);
});

test("createSupplier rejects a duplicate (case-insensitive) name", async () => {
    const { prisma, calls, captured } = createMockPrisma({
        findManyReturn: [MOCK_SUPPLIER],
    });

    await assert.rejects(
        () => createSupplier(prisma, { ...validCreateInput, name: "STARBUCKS" }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            return true;
        },
    );

    assert.equal(calls.create, 0);
    assert.deepEqual(captured.findManyArgs, {
        where: { name: { equals: "STARBUCKS", mode: "insensitive" } },
    });
});

test("createSupplier rejects an unknown supplier type", async () => {
    const { prisma, calls } = createMockPrisma({ typeFindUnique: null });

    await assert.rejects(
        () => createSupplier(prisma, validCreateInput),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 404);
            return true;
        },
    );

    assert.equal(calls.create, 0);
});

test("createSupplier stores a new supplier as ACTIVATED with its opening hours", async () => {
    const { prisma, calls, captured } = createMockPrisma({
        typeFindUnique: { type: "FOOD" },
        createReturn: MOCK_SUPPLIER,
    });

    const result = await createSupplier(prisma, validCreateInput);

    assert.equal(result.name, "Starbucks");
    assert.equal(calls.create, 1);

    const data = (captured.createArgs as { data: SupplierData }).data;
    assert.equal(data.name, "Starbucks");
    assert.equal(data.type, "FOOD");
    assert.equal(data.status, "ACTIVATED");
    assert.equal(data.latitude, 1.3);
    assert.equal(data.openingHours.create.length, 2);
    assert.equal(data.openingHours.create[0]!.day, "MONDAY");
    assert.equal(data.openingHours.create[0]!.openingTime.toISOString(), "1970-01-01T08:00:00.000Z");
    assert.equal(data.openingHours.create[0]!.closingTime.toISOString(), "1970-01-01T18:00:00.000Z");
    assert.deepEqual(captured.typeFindUniqueArgs, { where: { type: "FOOD" } });
    const { imageUrl: _imageUrl, ...expectedInput } = validCreateInput;
    assert.deepEqual(captured.createArgs, {
        data: {
            ...expectedInput,
            status: "ACTIVATED",
            openingHours: data.openingHours,
        },
        include: { openingHours: true },
    });
});

test("updateSupplier returns 404 for an unknown supplier", async () => {
    const { prisma, calls } = createMockPrisma({ supplierFindUnique: null });

    await assert.rejects(
        () => updateSupplier(prisma, "missing", { name: "New name" }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 404);
            return true;
        },
    );

    assert.equal(calls.update, 0);
});

test("updateSupplier rejects an unknown type on change", async () => {
    const { prisma, calls } = createMockPrisma({
        supplierFindUnique: { ...MOCK_SUPPLIER, status: "ACTIVATED" },
        typeFindUnique: null,
    });

    await assert.rejects(
        () => updateSupplier(prisma, "sup_1", { type: "UNKNOWN" }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 404);
            return true;
        },
    );

    assert.equal(calls.update, 0);
});

test("updateSupplier rejects a name that collides with another supplier", async () => {
    const { prisma, calls } = createMockPrisma({
        supplierFindUnique: { ...MOCK_SUPPLIER, status: "ACTIVATED" },
        typeFindUnique: { type: "FOOD" },
        findManyReturn: [{ ...MOCK_SUPPLIER, id: "sup_2", name: "Costa" }],
    });

    await assert.rejects(
        () => updateSupplier(prisma, "sup_1", { name: "Costa" }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            return true;
        },
    );

    assert.equal(calls.update, 0);
});

test("updateSupplier rejects an empty payload", async () => {
    const { prisma, calls } = createMockPrisma({
        supplierFindUnique: { ...MOCK_SUPPLIER, status: "ACTIVATED" },
    });

    await assert.rejects(
        () => updateSupplier(prisma, "sup_1", {}),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 400);
            return true;
        },
    );

    assert.equal(calls.update, 0);
});

test("updateSupplier changes scalar fields and replaces opening hours", async () => {
    const { prisma, calls, captured } = createMockPrisma({
        supplierFindUnique: { ...MOCK_SUPPLIER, status: "ACTIVATED" },
        updateReturn: { ...MOCK_SUPPLIER, name: "Starbucks Rebranded", floor: "5" },
    });

    const result = await updateSupplier(prisma, "sup_1", {
        name: "Starbucks Rebranded",
        floor: "5",
        openingHours: [{ day: "FRIDAY", openingTime: "09:00", closingTime: "17:00" }],
    });

    assert.equal(result.name, "Starbucks Rebranded");
    assert.equal(calls.update, 1);

    const data = (captured.updateArgs as { data: SupplierData }).data;
    assert.equal(data.name, "Starbucks Rebranded");
    assert.equal(data.floor, "5");
    assert.deepEqual(data.openingHours.deleteMany, {});
    assert.equal(data.openingHours.create.length, 1);
    assert.equal(data.openingHours.create[0]!.day, "FRIDAY");
    assert.deepEqual(captured.updateArgs, {
        where: { id: "sup_1" },
        data: {
            name: "Starbucks Rebranded",
            floor: "5",
            openingHours: {
                deleteMany: {},
                create: [{ day: "FRIDAY", openingTime: new Date("1970-01-01T09:00:00Z"), closingTime: new Date("1970-01-01T17:00:00Z") }],
            },
        },
        include: { openingHours: true },
    });
});

test("createSupplier defaults nullable coordinates and leaves the image default to the database", async () => {
    const { latitude, longitude, imageUrl, openingHours, ...minimal } = validCreateInput;
    const { prisma, captured } = createMockPrisma({ typeFindUnique: { type: "FOOD" } });

    await createSupplier(prisma, minimal);

    assert.deepEqual(captured.createArgs, {
        data: { ...minimal, status: "ACTIVATED", latitude: null, longitude: null, openingHours: { create: [] } },
        include: { openingHours: true },
    });
});

test("createSupplier preserves a supplied image and zero coordinates", async () => {
    const { prisma, captured } = createMockPrisma({ typeFindUnique: { type: "FOOD" } });
    await createSupplier(prisma, { ...validCreateInput, latitude: 0, longitude: 0, imageUrl: "/supplier.png" });
    const data = (captured.createArgs as { data: Record<string, unknown> }).data;
    assert.equal(data.latitude, 0);
    assert.equal(data.longitude, 0);
    assert.equal(data.imageUrl, "/supplier.png");
});

for (const action of ["create", "update"] as const) {
    test(`${action}Supplier rejects duplicate opening days without writing`, async () => {
        const { prisma, calls } = createMockPrisma({
            supplierFindUnique: MOCK_SUPPLIER,
            typeFindUnique: { type: "FOOD" },
        });
        const openingHours = [validCreateInput.openingHours![0]!, validCreateInput.openingHours![0]!];
        await assert.rejects(
            () => action === "create"
                ? createSupplier(prisma, { ...validCreateInput, openingHours })
                : updateSupplier(prisma, "sup_1", { openingHours }),
            { statusCode: 400, code: "BAD_REQUEST", message: "Duplicate opening hours for MONDAY" },
        );
        assert.equal(calls.create, 0);
        assert.equal(calls.update, 0);
    });
}

test("updateSupplier changes all supplied scalar fields without replacing hours or status", async () => {
    const { prisma, captured } = createMockPrisma({
        supplierFindUnique: { ...MOCK_SUPPLIER, status: "DEACTIVATED" },
        typeFindUnique: { type: "RETAIL" },
    });
    const input = {
        name: "New name", type: "RETAIL", building: "Library", floor: "B1",
        description: "Snacks", address: "2 Library Lane", latitude: 0, longitude: 0, imageUrl: "/new.png",
    };

    await updateSupplier(prisma, "sup_1", input);

    assert.deepEqual(captured.updateArgs, {
        where: { id: "sup_1" }, data: input, include: { openingHours: true },
    });
    assert.deepEqual(captured.typeFindUniqueArgs, { where: { type: "RETAIL" } });
});

test("updateSupplier can explicitly clear optional fields and opening hours", async () => {
    const { prisma, captured } = createMockPrisma({ supplierFindUnique: MOCK_SUPPLIER });
    await updateSupplier(prisma, "sup_1", { latitude: null, longitude: null, imageUrl: null, openingHours: [] });
    assert.deepEqual(captured.updateArgs, {
        where: { id: "sup_1" },
        data: { latitude: null, longitude: null, imageUrl: null, openingHours: { deleteMany: {}, create: [] } },
        include: { openingHours: true },
    });
});

test("updateSupplier accepts a case-only rename without treating itself as a duplicate", async () => {
    const { prisma, calls, captured } = createMockPrisma({ supplierFindUnique: MOCK_SUPPLIER });
    await updateSupplier(prisma, "sup_1", { name: "STARBUCKS" });
    assert.equal(calls.findMany, 0);
    assert.equal(calls.typeFindUnique, 0);
    assert.deepEqual(captured.updateArgs, {
        where: { id: "sup_1" }, data: { name: "STARBUCKS" }, include: { openingHours: true },
    });
});

test("opening hours retain seconds at the midnight boundary", async () => {
    const { prisma, captured } = createMockPrisma({ typeFindUnique: { type: "FOOD" } });
    await createSupplier(prisma, {
        ...validCreateInput,
        openingHours: [{ day: "SUNDAY", openingTime: "00:00:01", closingTime: "23:59:59" }],
    });
    const hours = (captured.createArgs as { data: SupplierData }).data.openingHours.create[0]!;
    assert.equal(hours.openingTime.toISOString(), "1970-01-01T00:00:01.000Z");
    assert.equal(hours.closingTime.toISOString(), "1970-01-01T23:59:59.000Z");
});

test("deactivateSupplier returns 404 for an unknown supplier", async () => {
    const { prisma, calls } = createMockPrisma({ supplierFindUnique: null });

    await assert.rejects(
        () => deactivateSupplier(prisma, "missing"),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 404);
            return true;
        },
    );

    assert.equal(calls.update, 0);
});

test("deactivateSupplier rejects when already deactivated", async () => {
    const { prisma, calls } = createMockPrisma({
        supplierFindUnique: { ...MOCK_SUPPLIER, status: "DEACTIVATED" },
    });

    await assert.rejects(
        () => deactivateSupplier(prisma, "sup_1"),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 409);
            return true;
        },
    );

    assert.equal(calls.update, 0);
});

test("deactivateSupplier sets the supplier status to DEACTIVATED", async () => {
    const { prisma, calls, captured } = createMockPrisma({
        supplierFindUnique: { ...MOCK_SUPPLIER, status: "ACTIVATED" },
        updateReturn: { ...MOCK_SUPPLIER, status: "DEACTIVATED" },
    });

    const result = await deactivateSupplier(prisma, "sup_1");

    assert.equal(result.status, "DEACTIVATED");
    assert.equal(calls.update, 1);

    assert.deepEqual(captured.findUniqueArgs, { where: { id: "sup_1" } });
    assert.deepEqual(captured.updateArgs, {
        where: { id: "sup_1" },
        data: { status: "DEACTIVATED" },
        include: { openingHours: true },
    });
});

test("activateSupplier returns 404 without writing for an unknown supplier", async () => {
    const { prisma, calls } = createMockPrisma();
    await assert.rejects(() => activateSupplier(prisma, "missing"), (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 404);
        return true;
    });
    assert.equal(calls.update, 0);
});

test("activateSupplier returns the existing active supplier without writing", async () => {
    const supplier = { ...MOCK_SUPPLIER, openingHours: [{ day: "MONDAY" }] };
    const { prisma, calls, captured } = createMockPrisma({ supplierFindUnique: supplier });
    const result = await activateSupplier(prisma, supplier.id);
    assert.strictEqual(result, supplier);
    assert.equal(calls.update, 0);
    assert.deepEqual(captured.findUniqueArgs, {
        where: { id: supplier.id },
        include: { openingHours: true },
    });
});

test("activateSupplier changes only the selected supplier's status and is safe to repeat", async () => {
    const supplier = { ...MOCK_SUPPLIER, status: "DEACTIVATED" };
    const activeSupplier = { ...supplier, status: "ACTIVATED" };
    const { prisma, calls, captured } = createMockPrisma({
        supplierFindUnique: supplier,
        updateReturn: activeSupplier,
    });
    assert.deepEqual(await activateSupplier(prisma, supplier.id), activeSupplier);
    assert.deepEqual(captured.updateArgs, {
        where: { id: supplier.id },
        data: { status: "ACTIVATED" },
        include: { openingHours: true },
    });
    supplier.status = "ACTIVATED";
    assert.strictEqual(await activateSupplier(prisma, supplier.id), supplier);
    assert.equal(calls.update, 1);
});
