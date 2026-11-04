import test from "node:test";
import assert from "node:assert/strict";
import {
    getCourierOrderHistorySchema,
    getOpenOrdersSchema,
    courierUpdateStatusSchema
} from "../schemas/order.courier.schema.js";

const validOpenOrdersInput = {
    page: "1", 
    sortBy: "offeredCredits",
    sortOrder: "asc",
    filterLocation: "supplier-id",
    searchString: "abc"
};

const validCourierHistoryInput = {
    page: "1", 
    sortBy: "acceptedAt",
    status: "ACCEPTED",
    sortOrder: "desc"
};

const validCourierUpdateStatusInput = {
    expectedVersion: "2"
}

test("getOpenOrdersSchema accepts a complete valid payload", () => {
    const result = getOpenOrdersSchema.parse(validOpenOrdersInput);

    assert.equal(result.page, 1);
    assert.equal(result.sortBy, "offeredCredits");
    assert.equal(result.sortOrder, "asc");
    assert.equal(result.filterLocation, "supplier-id");
    assert.equal(result.searchString, "abc");
});

test("getOpenOrdersSchema uses defaults for the relevant optional fields", () => {
    const input = { page: validOpenOrdersInput.page };
    const result = getOpenOrdersSchema.parse(input);

    assert.equal(result.page, 1);
    assert.equal(result.sortBy, "expiryAt");
    assert.equal(result.sortOrder, "asc");
    assert.equal(result.filterLocation, undefined);
    assert.equal(result.searchString, undefined);
});

test("getOpenOrdersSchema rejects missing required fields", () => {
    assert.throws(
        () => getOpenOrdersSchema.parse({ ...validOpenOrdersInput, page: "" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getOpenOrdersSchema rejects invalid page input", () => {
    assert.throws(
        () => getOpenOrdersSchema.parse({ ...validOpenOrdersInput, page: "0" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getOpenOrdersSchema rejects invalid sortBy input", () => {
    assert.throws(
        () => getOpenOrdersSchema.parse({ ...validOpenOrdersInput, sortBy: "name" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getOpenOrdersSchema rejects invalid sortOrder input", () => {
    assert.throws(
        () => getOpenOrdersSchema.parse({ ...validOpenOrdersInput, sortBy: "ascending" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getCourierOrderHistorySchema accepts a complete valid payload", () => {
    const result = getCourierOrderHistorySchema.parse(validCourierHistoryInput);

    assert.equal(result.page, 1);
    assert.equal(result.sortBy, "acceptedAt");
    assert.equal(result.status, "ACCEPTED");
    assert.equal(result.sortOrder, "desc");
});

test("getCourierOrderHistorySchema uses defaults for the relevant optional fields", () => {
    const input = { page: validCourierHistoryInput.page };
    const result = getCourierOrderHistorySchema.parse(input);

    assert.equal(result.page, 1);
    assert.equal(result.sortBy, "acceptedAt");
    assert.equal(result.status, undefined);
    assert.equal(result.sortOrder, "desc");
});

test("getCourierOrderHistorySchema uses defaults for the relevant optional fields", () => {
    const input = { page: validCourierHistoryInput.page };
    const result = getCourierOrderHistorySchema.parse(input);

    assert.equal(result.page, 1);
    assert.equal(result.sortBy, "acceptedAt");
    assert.equal(result.status, undefined);
    assert.equal(result.sortOrder, "desc");
});

test("getCourierOrderHistorySchema rejects invalid page input", () => {
    assert.throws(
        () => getOpenOrdersSchema.parse({ ...validCourierHistoryInput, page: "0" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getCourierOrderHistorySchema rejects invalid sortBy input", () => {
    assert.throws(
        () => getOpenOrdersSchema.parse({ ...validCourierHistoryInput, sortBy: "name" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getCourierOrderHistorySchema rejects invalid status input", () => {
    assert.throws(
        () => getOpenOrdersSchema.parse({ ...validCourierHistoryInput, sortBy: "ascending" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("getCourierOrderHistorySchema rejects invalid status input", () => {
    assert.throws(
        () => getOpenOrdersSchema.parse({ ...validCourierHistoryInput, sortBy: "INVALID_STATUS" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("courierUpdateStatusSchema accepts a valid input", () => {
    const result = courierUpdateStatusSchema.parse(validCourierUpdateStatusInput);

    assert.equal(result.expectedVersion, 2)
});

test("courierUpdateStatusSchema rejects invalid page input", () => {
    assert.throws(
        () => courierUpdateStatusSchema.parse({ ...validCourierUpdateStatusInput, expectedVersion: "0" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
    assert.throws(
        () => courierUpdateStatusSchema.parse({ ...validCourierUpdateStatusInput, expectedVersion: "-10" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});
