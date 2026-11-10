// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Route, authentication and authorization tests for supplier management.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import test, { after, afterEach, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keyDir = mkdtempSync(join(tmpdir(), "supplier-route-test-"));
after(() => rmSync(keyDir, { recursive: true, force: true }));
const publicKeyPath = join(keyDir, "public.pem");
writeFileSync(publicKeyPath, publicKey.export({ type: "spki", format: "pem" }));

const asyncMock = () => mock.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
const prisma = {
    supplier: {
        findMany: asyncMock(), findUnique: asyncMock(), create: asyncMock(),
        update: asyncMock(), delete: asyncMock(),
    },
    supplierType: { findUnique: asyncMock() },
};
mock.module("../libs/prisma.js", { namedExports: { prisma } });
mock.module("../config/config.js", { defaultExport: { jwtPublicKeyPath: publicKeyPath } });

const { default: router } = await import("./supplier.route.js");
const { errorHandler } = await import("../middleware/error.middleware.js");
const app = express();
app.use(express.json());
app.use("/api/suppliers", router);
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}/api/suppliers`;

const input = {
    name: "Starbucks", type: "FOOD", building: "Engineering", floor: "B1",
    description: "Coffee", address: "4 Engineering Road",
    openingHours: [{ day: "MONDAY", openingTime: "08:00", closingTime: "18:00" }],
};
const supplier = { ...input, id: "sup_1", status: "ACTIVATED" };
const endpoints = [
    { feature: "F2", method: "POST", path: "", body: input },
    { feature: "F3", method: "PATCH", path: "/sup_1", body: { floor: "2" } },
    { feature: "F4", method: "PATCH", path: "/sup_1/deactivation", body: undefined },
];

function token(role: string) {
    return jwt.sign({ userId: "user_1", email: "test@example.com", role }, privateKey, {
        algorithm: "RS256", expiresIn: "5m",
    });
}

async function request(method: string, path: string, body: unknown, authorization = `Bearer ${token("ADMIN")}`) {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as { success: boolean; code: string; data?: unknown } };
}

const methods = ["findMany", "findUnique", "create", "update", "delete"] as const;
const supplierMocks: Record<string, { mock: { callCount(): number } }> = {};

function stubSupplier(method: typeof methods[number], implementation: (...args: unknown[]) => Promise<unknown>) {
    const fn = mock.fn(implementation);
    Reflect.set(prisma.supplier, method, fn);
    return fn;
}

beforeEach(() => {
    mock.method(console, "log", () => {});
    mock.method(console, "error", () => {});
    // Unexpected database calls fail instead of silently returning a success fixture.
    for (const method of methods) {
        supplierMocks[method] = stubSupplier(method, async () => { throw new Error(`Unexpected supplier.${method}`); });
    }
    Reflect.set(prisma.supplierType, "findUnique", mock.fn(async () => { throw new Error("Unexpected supplierType.findUnique"); }));
});
afterEach(() => mock.restoreAll());

for (const endpoint of endpoints) {
    for (const auth of [
        { name: "anonymous", value: "", status: 401 },
        { name: "invalid token", value: "Bearer invalid", status: 401 },
        { name: "student", value: `Bearer ${token("STUDENT")}`, status: 403 },
    ]) {
        test(`${endpoint.feature} rejects ${auth.name} before accessing supplier data`, async () => {
            const result = await request(endpoint.method, endpoint.path, endpoint.body, auth.value);
            assert.equal(result.status, auth.status);
            assert.equal(result.body.success, false);
            for (const method of methods) {
                assert.equal(supplierMocks[method]!.mock.callCount(), 0);
            }
        });
    }
}

test("F2 admin creates a supplier at POST /api/suppliers with a 201 response", async () => {
    stubSupplier("findMany", async () => []);
    Reflect.set(prisma.supplierType, "findUnique", mock.fn(async () => ({ type: "FOOD" })));
    const create = stubSupplier("create", async () => supplier);

    const result = await request("POST", "", { ...input, name: "  Starbucks  " });

    assert.deepEqual(result, { status: 201, body: { success: true, code: "SUCCESS", data: supplier } });
    assert.equal(create.mock.callCount(), 1);
    assert.equal((create.mock.calls[0]!.arguments[0] as { data: { name: string } }).data.name, "Starbucks");
});

test("F3 admin updates a supplier at PATCH /api/suppliers/:supplierId", async () => {
    stubSupplier("findUnique", async () => supplier);
    const updated = { ...supplier, floor: "2" };
    const update = stubSupplier("update", async () => updated);

    assert.deepEqual(await request("PATCH", "/sup_1", { floor: "2" }), {
        status: 200, body: { success: true, code: "SUCCESS", data: updated },
    });
    assert.deepEqual(update.mock.calls[0]!.arguments[0], {
        where: { id: "sup_1" }, data: { floor: "2" }, include: { openingHours: true },
    });
});

test("F4 admin soft-deactivates a supplier at PATCH /api/suppliers/:supplierId/deactivation", async () => {
    stubSupplier("findUnique", async () => supplier);
    const deactivated = { ...supplier, status: "DEACTIVATED" };
    const update = stubSupplier("update", async () => deactivated);

    assert.deepEqual(await request("PATCH", "/sup_1/deactivation", undefined), {
        status: 200, body: { success: true, code: "SUCCESS", data: deactivated },
    });
    assert.deepEqual(update.mock.calls[0]!.arguments[0], {
        where: { id: "sup_1" }, data: { status: "DEACTIVATED" }, include: { openingHours: true },
    });
    assert.equal(supplierMocks.delete!.mock.callCount(), 0);
});

for (const method of ["POST", "PATCH"]) {
    test(`${method} rejects invalid supplier input with 422 before a write`, async () => {
        const result = await request(method, method === "POST" ? "" : "/sup_1", { floor: 2 });
        assert.equal(result.status, 422);
        assert.equal(result.body.code, "UNPROCESSABLE_ENTITY");
        assert.equal(supplierMocks.create!.mock.callCount(), 0);
        assert.equal(supplierMocks.update!.mock.callCount(), 0);
    });
}

test("F2 returns a duplicate-name conflict through the error middleware", async () => {
    stubSupplier("findMany", async () => [supplier]);
    const result = await request("POST", "", input);
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "CONFLICT");
    assert.equal(supplierMocks.create!.mock.callCount(), 0);
});

for (const path of ["/missing", "/missing/deactivation"]) {
    test(`PATCH ${path} returns 404 without writing`, async () => {
        stubSupplier("findUnique", async () => null);
        const result = await request("PATCH", path, { floor: "2" });
        assert.equal(result.status, 404);
        assert.equal(result.body.code, "NOT_FOUND");
        assert.equal(supplierMocks.update!.mock.callCount(), 0);
    });
}

test("F4 returns 409 when a supplier is already deactivated", async () => {
    stubSupplier("findUnique", async () => ({ ...supplier, status: "DEACTIVATED" }));
    const result = await request("PATCH", "/sup_1/deactivation", undefined);
    assert.equal(result.status, 409);
    assert.equal(result.body.code, "CONFLICT");
    assert.equal(supplierMocks.update!.mock.callCount(), 0);
});
