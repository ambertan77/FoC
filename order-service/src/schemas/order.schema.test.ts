import test from "node:test";
import assert from "node:assert/strict";
import {
    getAllOrdersSchema
} from "../schemas/order.schema.js";

const validAllOrdersInput = {
    page: "1", 
    statuses: "OPEN",
    sortBy: "createdAt",
    sortOrder: "desc",
    filterLocation: "supplier-id",
    searchString: "abc",
    startDate: "2026-11-01",
    endDate: "2026-11-30"
};

test("getAllOrdersSchema accepts a complete valid payload", () => {
    const result = getAllOrdersSchema.parse(validAllOrdersInput);

    assert.equal(result.page, 1);
    assert.deepEqual(result.statuses, ["OPEN"]);
    assert.equal(result.sortBy, "createdAt");
    assert.equal(result.sortOrder, "desc");
    assert.equal(result.filterLocation, "supplier-id");
    assert.equal(result.searchString, "abc");
    assert.deepEqual(result.startDate, new Date("2026-11-01T00:00:00.000+08:00"));
    assert.deepEqual(result.endDate, new Date("2026-11-30T23:59:59.999+08:00"));
});

test("getAllOrdersSchema uses defaults for the relevant optional fields", () => {
    const input = { page: validAllOrdersInput.page };
    const result = getAllOrdersSchema.parse(input);

    assert.equal(result.page, 1);
    assert.equal(result.statuses, undefined);
    assert.equal(result.sortBy, "createdAt");
    assert.equal(result.sortOrder, "desc");
    assert.equal(result.filterLocation, undefined);
    assert.equal(result.searchString, undefined);
    assert.equal(result.startDate, undefined);
    assert.equal(result.endDate, undefined);
});

test("getAllOrdersSchema rejects missing required fields", () => {
    assert.throws(
        () => getAllOrdersSchema.parse({ ...validAllOrdersInput, page: "" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getAllOrdersSchema rejects invalid page input", () => {
    assert.throws(
        () => getAllOrdersSchema.parse({ ...validAllOrdersInput, page: "0" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getAllOrdersSchema rejects invalid status input", () => {
    assert.throws(
        () => getAllOrdersSchema.parse({ ...validAllOrdersInput, statuses: "NOT_A_STATUS" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getAllOrdersSchema rejects invalid sortBy input", () => {
    assert.throws(
        () => getAllOrdersSchema.parse({ ...validAllOrdersInput, sortBy: "name" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getAllOrdersSchema rejects invalid sortOrder input", () => {
    assert.throws(
        () => getAllOrdersSchema.parse({ ...validAllOrdersInput, sortBy: "ascending" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getAllOrdersSchema rejects invalid startDate input", () => {
    assert.throws(
        () => getAllOrdersSchema.parse({ ...validAllOrdersInput, startDate: "2026-11-31" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getAllOrdersSchema rejects invalid endDate input", () => {
    assert.throws(
        () => getAllOrdersSchema.parse({ ...validAllOrdersInput, endDate: "2026-11-31" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});
