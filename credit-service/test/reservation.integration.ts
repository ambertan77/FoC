// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Reservation, balance, ledger, concurrency and internal HTTP regression tests; current fixture creates reservations through the asynchronous service.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import express from "express";
import { reservationSchema } from "../src/schemas/reservation.schema.js";
import { creditTransaction } from "../src/libs/credit-transaction.js";
import { errorHandler } from "../src/middleware/error.middleware.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { reservationServices } from "./reservation-fixture.js";
import { grantInitialCredits, getCreditBalance, getCreditTransactions } from "../src/services/credit.service.js";
import { AppError } from "../src/errors/errors.js";

const connectionString = process.env.CREDIT_TEST_DATABASE_URL;
test("F4 PostgreSQL atomicity, races, recovery and ledger regressions", { skip: !connectionString }, async t => {
    const schema = `f4_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const legacyId = randomUUID();
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema }) });
    try {
        const { reserveCredits, abortReservation, getReservation } = await reservationServices(t, prisma);
        await admin.query(`SET search_path TO "${schema}"`);
        for (const name of (await readdir(new URL("../prisma/migrations/", import.meta.url))).sort()) {
            if (name === "migration_lock.toml") continue;
            const sql = await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8");
            if (name === "20261017000000_allow_multiple_order_reservations") {
                await t.test("upgrade preserves an existing hold and permits another for the same order", async () => {
                    const orderId = randomUUID();
                    const requesterId = randomUUID();
                    const insert = `INSERT INTO "CreditReservation" ("id", "orderId", "requesterId", "amount", "updatedAt") VALUES ($1, $2, $3, 10, CURRENT_TIMESTAMP) RETURNING *`;
                    const first = await admin.query(insert, [randomUUID(), orderId, requesterId]);
                    await assert.rejects(admin.query(insert, [randomUUID(), orderId, requesterId]),
                        (error: any) => error.code === "23505" && error.constraint === "CreditReservation_one_active_order");
                    await admin.query(sql);
                    const preserved = await admin.query(`SELECT * FROM "CreditReservation" WHERE "id" = $1`, [first.rows[0].id]);
                    assert.deepEqual(preserved.rows, first.rows);
                    await admin.query(insert, [randomUUID(), orderId, requesterId]);
                    const holds = await admin.query(`SELECT "id" FROM "CreditReservation" WHERE "orderId" = $1 AND "status" = 'RESERVED'`, [orderId]);
                    assert.equal(holds.rowCount, 2);
                });
            } else {
                if (name === "20261028074853_support_create_renew_async") {
                    await t.test("async migration rejects populated legacy reservations", async () => {
                        await assert.rejects(admin.query(sql), (error: any) => error.code === "23502");
                    });
                    // These rows only exercise the earlier migration; the async schema requires request records.
                    await admin.query('DELETE FROM "CreditReservation"');
                }
                await admin.query(sql);
            }
        }
        const input = (requesterId = randomUUID(), amount = 10) => ({ orderId: randomUUID(), requesterId, amount });
        const reservationFor = (request: ReturnType<typeof input>) => prisma.creditReservation.findFirstOrThrow({ where: { orderId: request.orderId } });
        const errorStatus = (status: number) => (e: unknown) => e instanceof AppError && e.statusCode === status;
        await t.test("abort tombstones with request records remain readable", async () => {
            const request = await prisma.reservationRequest.create({ data: {
                eventId: randomUUID(), requestType: "CREATE", orderId: randomUUID(), requesterId: randomUUID(), amount: 10, outcome: "SUCCEEDED",
            } });
            await admin.query(`INSERT INTO "CreditReservation" ("id", "orderId", "requesterId", "amount", "status", "updatedAt", "requestEventId") VALUES ($1, $2, $3, 10, 'ABORTED', CURRENT_TIMESTAMP, $4)`, [legacyId, request.orderId, request.requesterId, request.eventId]);
            const legacy = await getReservation(legacyId);
            assert.equal(legacy.status, "ABORTED");
        });
        await t.test("reserve generates IDs, rejects caller IDs and preserves F1/F2/F3", async () => {
            const request = input();
            await grantInitialCredits(prisma, request.requesterId);
            const first = await reserveCredits(request);
            assert.equal(first.created, true);
            assert.match(first.reservation.id, /^[0-9a-f-]{36}$/);
            assert.equal(first.reservation.status, "RESERVED");
            assert.equal("idempotencyKey" in first.reservation, false);
            assert.equal(reservationSchema.safeParse({ ...request, reservationId: randomUUID() }).success, false);
            assert.equal(reservationSchema.safeParse({ ...request, idempotencyKey: randomUUID() }).success, false);
            await assert.rejects(reserveCredits(input(request.requesterId, 45)), errorStatus(409));
            await assert.rejects(reserveCredits(input()), errorStatus(404));
            const balance = await getCreditBalance(prisma, request.requesterId);
            assert.ok(balance.status === "READY");
            assert.equal(balance.availableCredits, 40);
            assert.equal(balance.reservedCredits, 10);
            assert.equal((await grantInitialCredits(prisma, request.requesterId)).created, false);
            const history = await getCreditTransactions(prisma, request.requesterId, { limit: 20, sort: "asc" });
            assert.ok(history.status === "READY");
            assert.deepEqual(history.items.map(row => [row.type, row.availableDelta, row.reservedDelta]), [["INITIAL_ALLOCATION", 50, 0], ["RESERVATION", -10, 10]]);
        });
        await t.test("identical concurrent calls create separate holds with generated IDs", async () => {
            const request = input();
            await grantInitialCredits(prisma, request.requesterId);
            const results = await Promise.all(Array.from({ length: 3 }, () => reserveCredits(request)));
            assert.equal(results.filter(result => result.created).length, 3);
            assert.equal(new Set(results.map(result => result.reservation.id)).size, 3);
            assert.equal(await prisma.creditTransaction.count({ where: { orderId: request.orderId } }), 3);
        });
        await t.test("CS F4: reserving the full balance succeeds; an unfunded request leaves balances and ledger unchanged", async () => {
            const request = input(undefined, 50);
            await grantInitialCredits(prisma, request.requesterId);
            const { reservation } = await reserveCredits(request);
            const account = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: request.requesterId } });
            assert.deepEqual([account.availableCredits, account.reservedCredits], [0, 50]);
            const rejected = input(request.requesterId, 1);
            await assert.rejects(reserveCredits(rejected), errorStatus(409));
            assert.equal(await prisma.creditReservation.count({ where: { orderId: rejected.orderId } }), 0);
            assert.equal(await prisma.creditTransaction.count({ where: { orderId: rejected.orderId } }), 0);
            assert.deepEqual(await prisma.creditAccount.findUniqueOrThrow({ where: { id: account.id } }), account);
            const ledger = await prisma.creditTransaction.findMany({ where: { reservationId: reservation.id } });
            assert.equal(ledger.length, 1);
            assert.deepEqual([ledger[0]!.type, ledger[0]!.amount, ledger[0]!.availableDelta, ledger[0]!.reservedDelta], ["RESERVATION", 50, -50, 50]);
        });
        await t.test("concurrent holds cannot overdraw; same order permits multiple active reservations", async () => {
            const request = input(undefined, 30);
            await grantInitialCredits(prisma, request.requesterId);
            const results = await Promise.allSettled([reserveCredits(request), reserveCredits(input(request.requesterId, 30))]);
            assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
            const account = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: request.requesterId } });
            assert.equal(account.availableCredits, 20);
            assert.equal(account.reservedCredits, 30);
            const another = input();
            await grantInitialCredits(prisma, another.requesterId);
            const sameOrder = await Promise.allSettled([reserveCredits(another), reserveCredits(another)]);
            assert.equal(sameOrder.filter(result => result.status === "fulfilled").length, 2);
            const holds = await prisma.creditReservation.findMany({ where: { orderId: another.orderId } });
            assert.equal(holds.length, 2);
            assert.notEqual(holds[0]!.id, holds[1]!.id);
            assert.ok(holds.every(hold => hold.status === "RESERVED"));
            await abortReservation({ ...another, reservationId: holds[0]!.id });
            assert.equal(await prisma.creditReservation.count({ where: { orderId: another.orderId, status: "RESERVED" } }), 1);
            const remaining = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: another.requesterId } });
            assert.deepEqual([remaining.availableCredits, remaining.reservedCredits], [40, 10]);
        });
        await t.test("reserve and abort balance overflow leave state unchanged", async () => {
            const request = input();
            await grantInitialCredits(prisma, request.requesterId);
            await prisma.creditAccount.update({ where: { userId: request.requesterId }, data: { reservedCredits: 2_147_483_647 } });
            await assert.rejects(reserveCredits(request), errorStatus(409));
            assert.equal(await prisma.creditReservation.count({ where: { orderId: request.orderId } }), 0);
            await prisma.creditAccount.update({ where: { userId: request.requesterId }, data: { reservedCredits: 0 } });
            const { reservation } = await reserveCredits(request);
            await prisma.creditAccount.update({ where: { userId: request.requesterId }, data: { availableCredits: 2_147_483_647 } });
            await assert.rejects(abortReservation({ ...request, reservationId: (await reservationFor(request)).id }), errorStatus(409));
            assert.equal((await getReservation(reservation.id)).status, "RESERVED");
            const account = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: request.requesterId } });
            assert.deepEqual([account.availableCredits, account.reservedCredits], [2_147_483_647, 10]);
            assert.equal(await prisma.creditTransaction.count({ where: { reservationId: reservation.id } }), 1);
        });
        await t.test("ledger failure rolls back hold and balances", async () => {
            const request = input();
            const grant = await grantInitialCredits(prisma, request.requesterId);
            await admin.query(`CREATE FUNCTION fail_reservation_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."type" = 'RESERVATION' THEN RAISE EXCEPTION 'injected ledger failure'; END IF; RETURN NEW; END $$`);
            await admin.query(`CREATE TRIGGER fail_reservation_ledger BEFORE INSERT ON "CreditTransaction" FOR EACH ROW EXECUTE FUNCTION fail_reservation_ledger()`);
            try { await assert.rejects(reserveCredits(request), /injected ledger failure/); }
            finally { await admin.query(`DROP TRIGGER fail_reservation_ledger ON "CreditTransaction"`); }
            assert.equal(await prisma.creditReservation.count({ where: { orderId: request.orderId } }), 0);
            const account = await prisma.creditAccount.findUniqueOrThrow({ where: { id: grant.account.id } });
            assert.equal(account.availableCredits, 50);
            assert.equal(account.reservedCredits, 0);
        });
        await t.test("funded abort refunds once; missing reservation returns 404", async () => {
            const request = input();
            await grantInitialCredits(prisma, request.requesterId);
            await reserveCredits(request);
            await admin.query(`CREATE FUNCTION fail_abort_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."type" = 'RELEASE' THEN RAISE EXCEPTION 'injected ledger uniqueness failure' USING ERRCODE = '23505'; END IF; RETURN NEW; END $$`);
            await admin.query(`CREATE TRIGGER fail_abort_ledger BEFORE INSERT ON "CreditTransaction" FOR EACH ROW EXECUTE FUNCTION fail_abort_ledger()`);
            try {
                await assert.rejects(abortReservation({ ...request, reservationId: (await reservationFor(request)).id }), (error: any) => error.code === "P2002");
                assert.equal((await getReservation((await reservationFor(request)).id)).status, "RESERVED");
                const held = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: request.requesterId } });
                assert.equal(held.availableCredits, 40);
                assert.equal(held.reservedCredits, 10);
            } finally { await admin.query(`DROP TRIGGER fail_abort_ledger ON "CreditTransaction"`); }
            await Promise.all([abortReservation({ ...request, reservationId: (await reservationFor(request)).id }), abortReservation({ ...request, reservationId: (await reservationFor(request)).id })]);
            assert.equal((await getReservation((await reservationFor(request)).id)).status, "ABORTED");
            const account = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: request.requesterId } });
            assert.equal(account.availableCredits, 50);
            assert.equal(account.reservedCredits, 0);
            assert.equal(await prisma.creditTransaction.count({ where: { reservationId: (await reservationFor(request)).id, type: "RELEASE" } }), 1);
            await assert.rejects(abortReservation({ ...request, reservationId: randomUUID() }), errorStatus(404));
        });
        await t.test("abort rejects mismatched reservation details without releasing credits", async () => {
            const request = input();
            await grantInitialCredits(prisma, request.requesterId);
            const { reservation } = await reserveCredits(request);
            for (const change of [{ orderId: randomUUID() }, { requesterId: randomUUID() }, { amount: 11 }]) {
                await assert.rejects(abortReservation({ ...request, reservationId: reservation.id, ...change }), errorStatus(409));
            }
            assert.equal((await getReservation(reservation.id)).status, "RESERVED");
            const account = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: request.requesterId } });
            assert.deepEqual([account.availableCredits, account.reservedCredits], [40, 10]);
        });
        await t.test("HTTP rejects invalid creation requests; lookup and abort use the async reservation ID", async () => {
            const request = input();
            await grantInitialCredits(prisma, request.requesterId);
            const app = express();
            app.use(express.json());
            const { default: internalCreditRouter } = await import("../src/routes/internal-credit.route.js");
            app.use("/internal/credits", internalCreditRouter);
            app.use(errorHandler);
            const server = app.listen(0, "127.0.0.1");
            await new Promise<void>(resolve => server.once("listening", resolve));
            const address = server.address();
            assert.ok(address && typeof address !== "string");
            const url = `http://127.0.0.1:${address.port}/internal/credits/reservations`;
            const post = (path: string, body: unknown) => fetch(path, { method: "POST", headers: { "X-Order-Credit-Service-Secret": "test-token", "Content-Type": "application/json" }, body: JSON.stringify(body) });
            try {
                const unauthorized = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
                assert.equal(unauthorized.status, 401);
                for (const change of [{ amount: 0 }, { amount: "10" }, { orderId: "invalid" }, { idempotencyKey: "caller-key" }]) {
                    assert.equal((await post(url, { ...request, ...change })).status, 400);
                }
                assert.equal(await prisma.creditReservation.count({ where: { orderId: request.orderId } }), 0);
                assert.equal(await prisma.creditTransaction.count({ where: { orderId: request.orderId } }), 0);
                const untouched = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: request.requesterId } });
                assert.deepEqual([untouched.availableCredits, untouched.reservedCredits], [50, 0]);
                const { reservation } = await reserveCredits(request);
                const reservationId = reservation.id;
                assert.equal((await post(url, { ...request, reservationId: randomUUID() })).status, 400);
                const lookup = await fetch(`${url}/${reservationId}`, { headers: { "X-Order-Credit-Service-Secret": "test-token" } });
                assert.equal(lookup.status, 200);
                assert.equal((await lookup.json()).data.status, "RESERVED");
                const aborted = await post(`${url}/${reservationId}/abort`, { ...request, reservationId });
                assert.equal(aborted.status, 200);
                assert.equal((await aborted.json()).data.status, "ABORTED");
            } finally {
                await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            }
        });
        await t.test("adapter connection failure becomes temporary HTTP 503", async () => {
            const unavailable = new PrismaClient({ adapter: new PrismaPg({ host: "127.0.0.1", port: 1, user: "test", database: "test", connectionTimeoutMillis: 100 }) });
            try { await assert.rejects(creditTransaction(unavailable, tx => tx.creditAccount.findMany()), errorStatus(503)); }
            finally { await unavailable.$disconnect(); }
        });
        await t.test("migration keeps ledger append-only and balance checks", async () => {
            await assert.rejects(admin.query(`UPDATE "CreditTransaction" SET "amount" = "amount"`), /append-only/);
            await assert.rejects(admin.query(`DELETE FROM "CreditTransaction"`), /append-only/);
            await assert.rejects(admin.query(`TRUNCATE "CreditTransaction"`), /append-only/);
            await assert.rejects(admin.query(`UPDATE "CreditAccount" SET "availableCredits" = -1`), /nonnegative/);
        });
    } finally {
        await prisma.$disconnect();
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
    }
});
