// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Supplier creation and update validation tests.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import test from "node:test";
import assert from "node:assert/strict";
import {
    createSupplierSchema,
    updateSupplierSchema,
    openingHoursSchema,
    parseInput,
} from "../schemas/supplier.schema.js";
import { AppError } from "../errors/errors.js";

const validCreateInput = {
    name: "Starbucks",
    type: "FOOD",
    building: "Engineering Building",
    floor: "1",
    description: "Coffee and pastries",
    address: "4 Engineering Road",
    latitude: 1.30,
    longitude: 103.77,
    imageUrl: "https://example.com/starbucks.jpg",
    openingHours: [
        { day: "MONDAY", openingTime: "08:00", closingTime: "18:00" },
        { day: "TUESDAY", openingTime: "08:00", closingTime: "18:00" },
    ],
};

test("createSupplierSchema accepts a complete valid payload", () => {
    const result = createSupplierSchema.parse(validCreateInput);

    assert.equal(result.name, "Starbucks");
    assert.equal(result.openingHours?.length, 2);
});

test("createSupplierSchema trims and accepts optional fields omitted", () => {
    const minimal = {
        name: "  Vending Machine  ",
        type: "  RETAIL  ",
        building: "  Library  ",
        floor: "  B2  ",
        description: "Snacks",
        address: "2 Library Lane",
    };

    const result = createSupplierSchema.parse(minimal);

    assert.equal(result.name, "Vending Machine");
    assert.equal(result.type, "RETAIL");
    assert.equal(result.building, "Library");
    assert.equal(result.floor, "B2");
    assert.equal(result.latitude, undefined);
    assert.equal(result.longitude, undefined);
    assert.equal(result.imageUrl, undefined);
    assert.equal(result.openingHours, undefined);
});

test("createSupplierSchema rejects missing required fields", () => {
    assert.throws(
        () => createSupplierSchema.parse({ ...validCreateInput, name: "" }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});


test("createSupplierSchema rejects an invalid day of week", () => {
    assert.throws(
        () =>
            createSupplierSchema.parse({
                ...validCreateInput,
                openingHours: [{ day: "SUNDAYY", openingTime: "08:00", closingTime: "18:00" }],
            }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("createSupplierSchema rejects malformed times", () => {
    assert.throws(
        () =>
            createSupplierSchema.parse({
                ...validCreateInput,
                openingHours: [{ day: "MONDAY", openingTime: "8am", closingTime: "6pm" }],
            }),
        (error: unknown) => error instanceof Error && error.name === "ZodError",
    );
});

test("updateSupplierSchema accepts a partial payload", () => {
    const result = updateSupplierSchema.parse({ name: "Starbucks #2", floor: "3" });

    assert.equal(result.name, "Starbucks #2");
    assert.equal(result.type, undefined);
});

test("openingHoursSchema accepts a valid single row", () => {
    const result = openingHoursSchema.parse({
        day: "WEDNESDAY",
        openingTime: "09:00",
        closingTime: "17:30",
    });

    assert.equal(result.day, "WEDNESDAY");
});

test("parseInput returns the parsed value for valid input", () => {
    const result = parseInput(createSupplierSchema, validCreateInput);

    assert.equal(result.name, "Starbucks");
});

test("parseInput throws AppError(422) for invalid input", () => {
    assert.throws(
        () => parseInput(createSupplierSchema, { name: "" }),
        (error: unknown) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.statusCode, 422);
            assert.equal(error.code, "UNPROCESSABLE_ENTITY");
            return true;
        },
    );
});

for (const field of ["name", "type", "building", "floor", "description", "address"] as const) {
    test(`F2 requires ${field}; F3 rejects an explicitly empty ${field}`, () => {
        const { [field]: omitted, ...rest } = validCreateInput;
        assert.equal(createSupplierSchema.safeParse(rest).success, false);
        assert.equal(createSupplierSchema.safeParse({ ...validCreateInput, [field]: "" }).success, false);
        assert.equal(updateSupplierSchema.safeParse({ [field]: "" }).success, false);
    });
}

test("F2 and F3 require string floors after the floor refactor", () => {
    assert.equal(createSupplierSchema.safeParse({ ...validCreateInput, floor: 1 }).success, false);
    assert.equal(updateSupplierSchema.safeParse({ floor: 1 }).success, false);
    assert.equal(updateSupplierSchema.parse({ floor: "B1" }).floor, "B1");
});

for (const time of ["24:00", "12:60", "12:00:60", "-1:00", "9:00"]) {
    test(`opening hours reject out-of-range or malformed time ${time}`, () => {
        const row = { day: "MONDAY", openingTime: "08:00", closingTime: "18:00" };
        assert.equal(openingHoursSchema.safeParse({ ...row, openingTime: time }).success, false);
        assert.equal(openingHoursSchema.safeParse({ ...row, closingTime: time }).success, false);
    });
}

test("opening hours accept seconds and overnight closing times", () => {
    const row = { day: "SATURDAY", openingTime: "23:59:59", closingTime: "00:00:00" };
    assert.deepEqual(openingHoursSchema.parse(row), row);
});

test("F3 accepts explicit nulls and empty hours to clear optional data", () => {
    const input = { latitude: null, longitude: null, imageUrl: null, openingHours: [] };
    assert.deepEqual(updateSupplierSchema.parse(input), input);
});

test("F2 and F3 strip status so lifecycle changes use their dedicated endpoints", () => {
    assert.equal("status" in createSupplierSchema.parse({ ...validCreateInput, status: "DEACTIVATED" }), false);
    assert.deepEqual(updateSupplierSchema.parse({ status: "DEACTIVATED" }), {});
});
