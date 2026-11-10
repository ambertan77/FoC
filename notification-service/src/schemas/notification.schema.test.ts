import test from "node:test";
import assert from "node:assert/strict";
import {
    idParamSchema,
    listQuerySchema,
} from "./notification.schema.js";

const notificationId = "11111111-1111-4111-8111-111111111111";

test("listQuerySchema applies default values", () => {
    const result = listQuerySchema.parse({});

    assert.deepEqual(result, {
        unread: "false",
        limit: 20,
    });
});

test("listQuerySchema accepts valid query parameters", () => {
    const result = listQuerySchema.parse({
        unread: "true",
        limit: "50",
        cursor: "10",
    });

    assert.equal(result.unread, "true");
    assert.equal(result.limit, 50);
    assert.equal(result.cursor, 10);
});

test("listQuerySchema coerces numeric query values", () => {
    const result = listQuerySchema.parse({
        limit: 25,
        cursor: 3,
    });

    assert.equal(result.limit, 25);
    assert.equal(result.cursor, 3);
});

test("listQuerySchema accepts both unread values", () => {
    assert.equal(
        listQuerySchema.safeParse({ unread: "true" }).success,
        true,
    );

    assert.equal(
        listQuerySchema.safeParse({ unread: "false" }).success,
        true,
    );
});

test("listQuerySchema rejects an invalid unread value", () => {
    const result = listQuerySchema.safeParse({
        unread: "yes",
    });

    assert.equal(result.success, false);
});

test("listQuerySchema rejects a limit below one", () => {
    const result = listQuerySchema.safeParse({
        limit: "0",
    });

    assert.equal(result.success, false);
});

test("listQuerySchema rejects a limit above one hundred", () => {
    const result = listQuerySchema.safeParse({
        limit: "101",
    });

    assert.equal(result.success, false);
});

test("listQuerySchema rejects fractional limits", () => {
    const result = listQuerySchema.safeParse({
        limit: "1.5",
    });

    assert.equal(result.success, false);
});

test("listQuerySchema rejects a non-positive cursor", () => {
    assert.equal(
        listQuerySchema.safeParse({ cursor: "0" }).success,
        false,
    );

    assert.equal(
        listQuerySchema.safeParse({ cursor: "-1" }).success,
        false,
    );
});

test("listQuerySchema rejects a fractional cursor", () => {
    const result = listQuerySchema.safeParse({
        cursor: "2.5",
    });

    assert.equal(result.success, false);
});

test("idParamSchema accepts a valid notification UUID", () => {
    const result = idParamSchema.safeParse({
        notificationId,
    });

    assert.equal(result.success, true);
});

test("idParamSchema rejects a malformed notification UUID", () => {
    const result = idParamSchema.safeParse({
        notificationId: "not-a-uuid",
    });

    assert.equal(result.success, false);
});

test("idParamSchema rejects a missing notification ID", () => {
    const result = idParamSchema.safeParse({});

    assert.equal(result.success, false);
});