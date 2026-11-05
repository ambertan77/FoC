import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { reservationServices } from "./reservation-fixture.js";
import { grantInitialCredits, getCreditTransactions } from "../src/services/credit.service.js";
import { AppError } from "../src/errors/errors.js";

import { refundCredits, releaseCredits, transferCredits } from "../src/services/settlement.service.js";
import { processSettlementMessage, startSettlementConsumer } from "../src/services/settlement-consumer.service.js";
import { connectSettlementMessaging, publishConfirmed, SETTLEMENT_MESSAGING, REGISTRATION_MESSAGING, declareRegistrationTopology } from "../src/libs/rabbitmq.js";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import type { ConfirmChannel, ConsumeMessage } from "amqplib";

const connectionString = process.env.CREDIT_TEST_DATABASE_URL;
test("F5/F6/F7 PostgreSQL settlement, races, rollback and history", { skip: !connectionString }, async t => {
    const schema = `f5_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new pg.Client({ connectionString });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, options: `-c search_path=${schema}` }, { schema }) });
    try {
        const { reserveCredits, abortReservation, getReservation } = await reservationServices(t, prisma);
        await admin.query(`SET search_path TO "${schema}"`);
        for (const name of (await readdir(new URL("../prisma/migrations/", import.meta.url))).sort()) {
            if (name === "migration_lock.toml") continue;
            await admin.query(await readFile(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url), "utf8"));
        }
        const errorStatus = (status: number) => (error: unknown) => error instanceof AppError && error.statusCode === status;
        async function held(amount = 10) {
            const request = { orderId: randomUUID(), requesterId: randomUUID(), amount };
            const courierId = randomUUID();
            await grantInitialCredits(prisma, request.requesterId); await grantInitialCredits(prisma, courierId);
            const { reservation } = await reserveCredits(request);
            const event = { ...request, reservationId: reservation.id, courierId, eventId: randomUUID(), eventType: "ORDER_RECEIVED" };
            return { request, event };
        }
        await t.test("same-order holds settle independently across receipt, release and refund", async () => {
            const { request, event } = await held();
            const second = await reserveCredits({ ...request, amount: 15 });
            const third = await reserveCredits({ ...request, amount: 5 });
            await transferCredits(prisma, event);
            assert.equal((await getReservation(second.reservation.id)).status, "RESERVED");
            assert.equal((await getReservation(third.reservation.id)).status, "RESERVED");
            assert.deepEqual(await balances(event.requesterId, event.courierId), [20, 20, 60, 0]);
            const { courierId, ...release } = event;
            const canceled = { ...release, eventType: "ORDER_CANCELED", eventId: randomUUID(), reservationId: second.reservation.id, amount: 15 };
            await releaseCredits(prisma, canceled);
            assert.equal((await getReservation(third.reservation.id)).status, "RESERVED");
            await refundCredits(prisma, { ...release, eventType: "ORDER_FAILED", eventId: randomUUID(), reservationId: third.reservation.id, amount: 5 });
            await transferCredits(prisma, event);
            await releaseCredits(prisma, canceled);
            assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 0, 60, 0]);
            assert.equal(await prisma.creditTransaction.count({ where: { orderId: request.orderId } }), 7);
        });
        async function balances(requesterId: string, courierId: string) {
            const requester = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: requesterId } });
            const courier = await prisma.creditAccount.findUniqueOrThrow({ where: { userId: courierId } });
            return [requester.availableCredits, requester.reservedCredits, courier.availableCredits, courier.reservedCredits];
        }
        for (const [requirement, eventType, settle] of [
            ["CS F5", "ORDER_RECEIVED", transferCredits],
            ["CS F6", "ORDER_CANCELED", releaseCredits],
            ["CS F6", "ORDER_EXPIRED", releaseCredits],
            ["CS F7", "ORDER_FAILED", refundCredits],
        ] as const) {
            await t.test(`${requirement}: ${eventType} preserves both participants' unrelated holds`, async () => {
                const { event, request } = await held();
                const requesterHold = await reserveCredits({ ...request, orderId: randomUUID(), amount: 15 });
                const courierHold = await reserveCredits({ orderId: randomUUID(), requesterId: event.courierId, amount: 7 });
                const input = eventType === "ORDER_RECEIVED" ? event : releaseEvent(event, eventType);
                await settle(prisma, input);
                const settled = await getReservation(event.reservationId);
                const ledger = await prisma.creditTransaction.findMany({ where: { reservationId: event.reservationId }, orderBy: { type: "asc" } });
                const isReceipt = eventType === "ORDER_RECEIVED";
                assert.deepEqual(await balances(event.requesterId, event.courierId), isReceipt ? [25, 15, 53, 7] : [35, 15, 43, 7]);
                assert.deepEqual(await getReservation(requesterHold.reservation.id), requesterHold.reservation);
                assert.deepEqual(await getReservation(courierHold.reservation.id), courierHold.reservation);
                await settle(prisma, input);
                assert.deepEqual(await getReservation(event.reservationId), settled);
                assert.deepEqual(await prisma.creditTransaction.findMany({ where: { reservationId: event.reservationId }, orderBy: { type: "asc" } }), ledger);
                assert.deepEqual(await balances(event.requesterId, event.courierId), isReceipt ? [25, 15, 53, 7] : [35, 15, 43, 7]);
            });
        }
        await t.test("transfer conserves funds, replays once and appears through existing F3", async () => {
            const { event } = await held();
            assert.equal((await transferCredits(prisma, event)).transferred, true);
            assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 0, 60, 0]);
            assert.equal((await transferCredits(prisma, { ...event, courierId: event.courierId.toUpperCase() })).transferred, false);
            const reservation = await getReservation(event.reservationId);
            assert.equal(reservation.status, "TRANSFERRED"); assert.equal(reservation.settlementEventId, event.eventId);
            assert.equal(reservation.settlementReason, "RECEIVED"); assert.ok(reservation.settledAt);
            const sent = await getCreditTransactions(prisma, event.requesterId, { type: "TRANSFER_SENT", limit: 20, sort: "desc" });
            const received = await getCreditTransactions(prisma, event.courierId, { type: "TRANSFER_RECEIVED", limit: 20, sort: "desc" });
            assert.ok(sent.status === "READY" && received.status === "READY");
            assert.equal(sent.items.length, 1); assert.equal(received.items.length, 1);
            assert.deepEqual([sent.items[0]?.availableDelta, sent.items[0]?.reservedDelta, received.items[0]?.availableDelta, received.items[0]?.reservedDelta], [0, -10, 10, 0]);
            assert.equal((await grantInitialCredits(prisma, event.courierId)).created, false);
            assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 0, 60, 0]);
        });
        await t.test("mismatch, self-transfer and altered full-envelope replays fail unchanged", async () => {
            const { event } = await held();
            for (const change of [{ amount: 11 }, { orderId: randomUUID() }, { requesterId: randomUUID() }, { courierId: event.requesterId }]) {
                await assert.rejects(transferCredits(prisma, { ...event, ...change }), errorStatus(409));
            }
            assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 10, 50, 0]); await transferCredits(prisma, event);
            for (const change of [{ eventId: randomUUID() }, { courierId: randomUUID() }]) {
                await assert.rejects(transferCredits(prisma, { ...event, ...change }), errorStatus(409));
            }
            assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 0, 60, 0]);
        });
        await t.test("missing courier is recoverable and never provisions implicitly", async () => {
            const { event } = await held(); const missing = { ...event, courierId: randomUUID() };
            await assert.rejects(transferCredits(prisma, missing), errorStatus(404));
            assert.equal(await prisma.creditAccount.count({ where: { userId: missing.courierId } }), 0);
            assert.equal((await getReservation(event.reservationId)).status, "RESERVED");
            await grantInitialCredits(prisma, missing.courierId); await transferCredits(prisma, missing);
            assert.deepEqual(await balances(missing.requesterId, missing.courierId), [40, 0, 60, 0]);
        });
        await t.test("second ledger insert failure rolls back state and both balances", async () => {
            const { event } = await held();
            await admin.query(`CREATE FUNCTION fail_transfer_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."type" = 'TRANSFER_RECEIVED' THEN RAISE EXCEPTION 'injected transfer failure'; END IF; RETURN NEW; END $$`);
            await admin.query(`CREATE TRIGGER fail_transfer_ledger BEFORE INSERT ON "CreditTransaction" FOR EACH ROW EXECUTE FUNCTION fail_transfer_ledger()`);
            try { await assert.rejects(transferCredits(prisma, event), /injected transfer failure/); }
            finally { await admin.query(`DROP TRIGGER fail_transfer_ledger ON "CreditTransaction"`); }
            assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 10, 50, 0]);
            const reservation = await getReservation(event.reservationId);
            assert.equal(reservation.status, "RESERVED"); assert.equal(reservation.settlementEventId, null);
            assert.equal(await prisma.creditTransaction.count({ where: { reservationId: event.reservationId } }), 1);
        });
        await t.test("duplicate and contradictory concurrent receipts settle once", async () => {
            const { event } = await held();
            const results = await Promise.all(Array.from({ length: 3 }, () => transferCredits(prisma, event)));
            assert.equal(results.filter(result => result.transferred).length, 1);
            const other = await held();
            const competing = await Promise.allSettled([transferCredits(prisma, other.event), transferCredits(prisma, { ...other.event, eventId: randomUUID() })]);
            assert.equal(competing.filter(result => result.status === "fulfilled").length, 1);
            assert.deepEqual(await balances(other.event.requesterId, other.event.courierId), [40, 0, 60, 0]);
            assert.equal(await prisma.creditTransaction.count({ where: { reservationId: event.reservationId } }), 3);
        });
        await t.test("transfer versus abort has exactly one terminal winner", async () => {
            for (let i = 0; i < 5; i++) {
                const { event, request } = await held();
                const outcomes = await Promise.allSettled([transferCredits(prisma, event), abortReservation({ ...request, reservationId: event.reservationId })]);
                assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
                const reservation = await getReservation(event.reservationId);
                assert.deepEqual(await balances(event.requesterId, event.courierId), reservation.status === "TRANSFERRED" ? [40, 0, 60, 0] : [50, 0, 50, 0]);
            }
        });
        await t.test("event reuse, overflow and short reserve roll back", async () => {
            const first = await held(); const second = await held(); await transferCredits(prisma, first.event);
            await assert.rejects(transferCredits(prisma, { ...second.event, eventId: first.event.eventId }), errorStatus(409));
            assert.deepEqual(await balances(second.event.requesterId, second.event.courierId), [40, 10, 50, 0]);
            await prisma.creditAccount.update({ where: { userId: second.event.courierId }, data: { availableCredits: 2_147_483_647 } });
            await assert.rejects(transferCredits(prisma, second.event), errorStatus(409));
            assert.equal((await getReservation(second.event.reservationId)).status, "RESERVED");
            const short = await held(); await prisma.creditAccount.update({ where: { userId: short.event.requesterId }, data: { reservedCredits: 0 } });
            await assert.rejects(transferCredits(prisma, short.event), errorStatus(409));
            assert.equal((await getReservation(short.event.reservationId)).status, "RESERVED");
        });
        await t.test("lost acknowledgment after commit replays without another transfer", async () => {
            const { event } = await held();
            const delivery = { content: Buffer.from(JSON.stringify(event)), fields: { routingKey: SETTLEMENT_MESSAGING.routingKeys.ORDER_RECEIVED }, properties: { messageId: event.eventId } } as ConsumeMessage;
            await assert.rejects(processSettlementMessage(prisma, { ack: () => { throw new Error("ack lost"); } } as unknown as ConfirmChannel, delivery), /ack lost/);
            let acked = false;
            await processSettlementMessage(prisma, { ack: () => { acked = true; } } as unknown as ConfirmChannel, delivery);
            assert.equal(acked, true); assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 0, 60, 0]);
            assert.equal(await prisma.creditTransaction.count({ where: { reservationId: event.reservationId } }), 3);
        });
        function releaseEvent(event: Awaited<ReturnType<typeof held>>["event"], eventType = "ORDER_CANCELED") {
            const { courierId, ...base } = event;
            return { ...base, eventType };
        }
        await t.test("failure refunds once, validates full replay and exposes REFUND through F3", async () => {
            const { event } = await held(); const failure = releaseEvent(event, "ORDER_FAILED");
            const results = await Promise.all(Array.from({ length: 3 }, () => refundCredits(prisma, failure)));
            assert.equal(results.filter(result => result.refunded).length, 1);
            const reservation = await getReservation(event.reservationId);
            assert.equal(reservation.status, "REFUNDED"); assert.equal(reservation.settlementReason, "FAILED");
            assert.equal(reservation.settlementEventId, event.eventId); assert.equal(reservation.courierId, null); assert.ok(reservation.settledAt);
            assert.equal((await refundCredits(prisma, { ...failure, requesterId: failure.requesterId.toUpperCase() })).refunded, false);
            assert.deepEqual(await balances(event.requesterId, event.courierId), [50, 0, 50, 0]);
            const history = await getCreditTransactions(prisma, event.requesterId, { type: "REFUND", limit: 20, sort: "desc" });
            assert.ok(history.status === "READY"); assert.equal(history.items.length, 1);
            assert.deepEqual([history.items[0]?.amount, history.items[0]?.availableDelta, history.items[0]?.reservedDelta], [10, 10, -10]);
            assert.equal(await prisma.creditTransaction.count({ where: { reservationId: event.reservationId } }), 2);
            for (const change of [{ eventId: randomUUID() }, { amount: 11 }, { orderId: randomUUID() }, { requesterId: randomUUID() }]) {
                await assert.rejects(refundCredits(prisma, { ...failure, ...change }), errorStatus(409));
            }
            await assert.rejects(refundCredits(prisma, { ...failure, courierId: event.courierId }), errorStatus(400));
            await assert.rejects(releaseCredits(prisma, releaseEvent(event)), errorStatus(409));
            await assert.rejects(transferCredits(prisma, event), errorStatus(409));
        });
        await t.test("refund rejects missing cycle, event reuse, balance bounds and already paid holds", async () => {
            const first = await held(); const failure = releaseEvent(first.event, "ORDER_FAILED");
            await assert.rejects(refundCredits(prisma, { ...failure, reservationId: randomUUID() }), errorStatus(404));
            await transferCredits(prisma, first.event);
            await reserveCredits({ ...first.request, orderId: randomUUID() });
            await assert.rejects(refundCredits(prisma, failure), errorStatus(409));
            assert.deepEqual(await balances(first.event.requesterId, first.event.courierId), [30, 10, 60, 0]);
            const second = await held();
            await assert.rejects(refundCredits(prisma, { ...releaseEvent(second.event, "ORDER_FAILED"), eventId: first.event.eventId }), errorStatus(409));
            await prisma.creditAccount.update({ where: { userId: second.event.requesterId }, data: { availableCredits: 2_147_483_647 } });
            await assert.rejects(refundCredits(prisma, releaseEvent(second.event, "ORDER_FAILED")), errorStatus(409));
            assert.equal((await getReservation(second.event.reservationId)).status, "RESERVED");
            const short = await held(); await prisma.creditAccount.update({ where: { userId: short.event.requesterId }, data: { reservedCredits: 0 } });
            await assert.rejects(refundCredits(prisma, releaseEvent(short.event, "ORDER_FAILED")), errorStatus(409));
            assert.equal((await getReservation(short.event.reservationId)).status, "RESERVED");
        });
        await t.test("refund ledger failure rolls back; lost ack and old cycle replay cannot refund a new hold", async () => {
            const { event, request } = await held(); const failure = releaseEvent(event, "ORDER_FAILED");
            await admin.query(`CREATE FUNCTION fail_refund_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."type" = 'REFUND' THEN RAISE EXCEPTION 'injected refund failure'; END IF; RETURN NEW; END $$`);
            await admin.query(`CREATE TRIGGER fail_refund_ledger BEFORE INSERT ON "CreditTransaction" FOR EACH ROW EXECUTE FUNCTION fail_refund_ledger()`);
            try { await assert.rejects(refundCredits(prisma, failure), /injected refund failure/); }
            finally { await admin.query(`DROP TRIGGER fail_refund_ledger ON "CreditTransaction"`); }
            const reservation = await getReservation(event.reservationId);
            assert.equal(reservation.status, "RESERVED"); assert.equal(reservation.settlementEventId, null);
            assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 10, 50, 0]);
            assert.equal(await prisma.creditTransaction.count({ where: { reservationId: event.reservationId } }), 1);
            const delivery = { content: Buffer.from(JSON.stringify(failure)), fields: { routingKey: SETTLEMENT_MESSAGING.routingKeys.ORDER_FAILED }, properties: { messageId: failure.eventId } } as ConsumeMessage;
            await assert.rejects(processSettlementMessage(prisma, { ack: () => { throw new Error("ack lost"); } } as unknown as ConfirmChannel, delivery), /ack lost/);
            const renewed = await reserveCredits(request);
            let acked = false; await processSettlementMessage(prisma, { ack: () => { acked = true; } } as unknown as ConfirmChannel, delivery);
            assert.equal(acked, true); assert.equal((await getReservation(renewed.reservation.id)).status, "RESERVED");
            assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 10, 50, 0]);
            assert.equal(await prisma.creditTransaction.count({ where: { reservationId: event.reservationId, type: "REFUND" } }), 1);
        });
        await t.test("cancel and expire restore once, retain reason and expose RELEASE through F3", async () => {
            for (const eventType of ["ORDER_CANCELED", "ORDER_EXPIRED"]) {
                const { event } = await held(); const release = releaseEvent(event, eventType);
                const result = await releaseCredits(prisma, release);
                assert.equal(result.released, true); assert.equal(result.reservation.status, "RELEASED");
                assert.equal(result.reservation.settlementReason, eventType === "ORDER_CANCELED" ? "CANCELED" : "EXPIRED");
                assert.equal(result.reservation.settlementEventId, event.eventId); assert.ok(result.reservation.settledAt);
                assert.equal((await releaseCredits(prisma, { ...release, requesterId: release.requesterId.toUpperCase() })).released, false);
                assert.deepEqual(await balances(event.requesterId, event.courierId), [50, 0, 50, 0]);
                const history = await getCreditTransactions(prisma, event.requesterId, { type: "RELEASE", limit: 20, sort: "desc" });
                assert.ok(history.status === "READY"); assert.equal(history.items.length, 1);
                assert.deepEqual([history.items[0]?.amount, history.items[0]?.availableDelta, history.items[0]?.reservedDelta], [10, 10, -10]);
                assert.equal(await prisma.creditTransaction.count({ where: { reservationId: event.reservationId } }), 2);
                for (const change of [{ eventId: randomUUID() }, { eventType: eventType === "ORDER_CANCELED" ? "ORDER_EXPIRED" : "ORDER_CANCELED" }]) {
                    await assert.rejects(releaseCredits(prisma, { ...release, ...change }), errorStatus(409));
                }
                await assert.rejects(transferCredits(prisma, event), errorStatus(409));
                await assert.rejects(abortReservation({ reservationId: event.reservationId, orderId: event.orderId, requesterId: event.requesterId, amount: event.amount }), errorStatus(409));
            }
        });
        await t.test("release validates exact cycle, balances and globally unique event identity", async () => {
            const first = await held(); const release = releaseEvent(first.event);
            for (const change of [{ amount: 11 }, { orderId: randomUUID() }, { requesterId: randomUUID() }]) {
                await assert.rejects(releaseCredits(prisma, { ...release, ...change }), errorStatus(409));
            }
            await assert.rejects(releaseCredits(prisma, { ...release, reservationId: randomUUID() }), errorStatus(404));
            await releaseCredits(prisma, release);
            const second = await held();
            await assert.rejects(releaseCredits(prisma, { ...releaseEvent(second.event), eventId: release.eventId }), errorStatus(409));
            await prisma.creditAccount.update({ where: { userId: second.event.requesterId }, data: { availableCredits: 2_147_483_647 } });
            await assert.rejects(releaseCredits(prisma, releaseEvent(second.event)), errorStatus(409));
            assert.equal((await getReservation(second.event.reservationId)).status, "RESERVED");
            const short = await held(); await prisma.creditAccount.update({ where: { userId: short.event.requesterId }, data: { reservedCredits: 0 } });
            await assert.rejects(releaseCredits(prisma, releaseEvent(short.event)), errorStatus(409));
            assert.equal((await getReservation(short.event.reservationId)).status, "RESERVED");
            const transferred = await held(); await transferCredits(prisma, transferred.event);
            await reserveCredits({ ...transferred.request, orderId: randomUUID() });
            await assert.rejects(releaseCredits(prisma, releaseEvent(transferred.event)), errorStatus(409));
            assert.deepEqual(await balances(transferred.event.requesterId, transferred.event.courierId), [30, 10, 60, 0]);
        });
        await t.test("release ledger failure rolls back balances and terminal identity", async () => {
            const { event } = await held();
            await admin.query(`CREATE FUNCTION fail_release_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."type" = 'RELEASE' THEN RAISE EXCEPTION 'injected release failure'; END IF; RETURN NEW; END $$`);
            await admin.query(`CREATE TRIGGER fail_release_ledger BEFORE INSERT ON "CreditTransaction" FOR EACH ROW EXECUTE FUNCTION fail_release_ledger()`);
            try { await assert.rejects(releaseCredits(prisma, releaseEvent(event)), /injected release failure/); }
            finally { await admin.query(`DROP TRIGGER fail_release_ledger ON "CreditTransaction"`); }
            const reservation = await getReservation(event.reservationId);
            assert.equal(reservation.status, "RESERVED"); assert.equal(reservation.settlementEventId, null);
            assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 10, 50, 0]);
            assert.equal(await prisma.creditTransaction.count({ where: { reservationId: event.reservationId } }), 1);
        });
        await t.test("duplicate release and competing receive/cancel/expire/fail/abort have one winner", async () => {
            const duplicate = await held();
            const repeats = await Promise.all(Array.from({ length: 3 }, () => releaseCredits(prisma, releaseEvent(duplicate.event))));
            assert.equal(repeats.filter(result => result.released).length, 1);
            for (let i = 0; i < 5; i++) {
                const { event, request } = await held();
                const results = await Promise.allSettled([transferCredits(prisma, event), releaseCredits(prisma, releaseEvent({ ...event, eventId: randomUUID() })), releaseCredits(prisma, releaseEvent({ ...event, eventId: randomUUID() }, "ORDER_EXPIRED")), refundCredits(prisma, releaseEvent({ ...event, eventId: randomUUID() }, "ORDER_FAILED")), abortReservation({ ...request, reservationId: event.reservationId })]);
                assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
                const reservation = await getReservation(event.reservationId);
                assert.deepEqual(await balances(event.requesterId, event.courierId), reservation.status === "TRANSFERRED" ? [40, 0, 60, 0] : [50, 0, 50, 0]);
                assert.equal(await prisma.creditTransaction.count({ where: { reservationId: event.reservationId } }), reservation.status === "TRANSFERRED" ? 3 : 2);
            }
        });
        await t.test("old expiry cannot release renewed cycle; commit before lost ack is safe", async () => {
            const { event, request } = await held(); const expiry = releaseEvent(event, "ORDER_EXPIRED");
            const delivery = { content: Buffer.from(JSON.stringify(expiry)), fields: { routingKey: SETTLEMENT_MESSAGING.routingKeys.ORDER_EXPIRED }, properties: { messageId: expiry.eventId } } as ConsumeMessage;
            await assert.rejects(processSettlementMessage(prisma, { ack: () => { throw new Error("ack lost"); } } as unknown as ConfirmChannel, delivery), /ack lost/);
            const renewed = await reserveCredits(request);
            let acked = false; await processSettlementMessage(prisma, { ack: () => { acked = true; } } as unknown as ConfirmChannel, delivery);
            assert.equal(acked, true); assert.equal((await getReservation(renewed.reservation.id)).status, "RESERVED");
            assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 10, 50, 0]);
            assert.equal(await prisma.creditTransaction.count({ where: { reservationId: event.reservationId, type: "RELEASE" } }), 1);
        });
        await t.test("real broker routing, delayed retry, DLQ, redrive and background consumer", { skip: !process.env.CREDIT_TEST_RABBITMQ_URL }, async () => {
            const previous = process.env.RABBITMQ_URL; process.env.RABBITMQ_URL = process.env.CREDIT_TEST_RABBITMQ_URL;
            const { connection, channel } = await connectSettlementMessaging();
            async function get(queue: string) {
                const deadline = Date.now() + 45_000;
                // Polled messages provide every field used by the settlement processor.
                while (Date.now() < deadline) { const message = await channel.get(queue, { noAck: false }); if (message) return message as unknown as ConsumeMessage; await delay(100); }
                throw new Error(`Timed out waiting for ${queue}`);
            }
            try {
                const { event } = await held(); const body = Buffer.from(JSON.stringify(event));
                await publishConfirmed(channel, SETTLEMENT_MESSAGING.exchange, SETTLEMENT_MESSAGING.routingKeys.ORDER_RECEIVED, body, { messageId: event.eventId });
                await declareRegistrationTopology(channel);
                const delivered = await get(SETTLEMENT_MESSAGING.queue); assert.equal(delivered.content.toString(), body.toString());
                assert.equal(await channel.get(REGISTRATION_MESSAGING.queue, { noAck: false }), false);
                await processSettlementMessage(prisma, channel, delivered);
                await publishConfirmed(channel, SETTLEMENT_MESSAGING.exchange, SETTLEMENT_MESSAGING.routingKeys.ORDER_RECEIVED, body, { messageId: event.eventId });
                await processSettlementMessage(prisma, channel, await get(SETTLEMENT_MESSAGING.queue));
                assert.deepEqual(await balances(event.requesterId, event.courierId), [40, 0, 60, 0]);
                const pending = await held(); pending.event.courierId = randomUUID(); const pendingBody = Buffer.from(JSON.stringify(pending.event));
                await publishConfirmed(channel, SETTLEMENT_MESSAGING.exchange, SETTLEMENT_MESSAGING.routingKeys.ORDER_RECEIVED, pendingBody, { messageId: pending.event.eventId });
                await processSettlementMessage(prisma, channel, await get(SETTLEMENT_MESSAGING.queue));
                const start = Date.now(); const retry = await get(SETTLEMENT_MESSAGING.queue);
                assert.ok(Date.now() - start >= 9_000);
                assert.equal(retry.properties.headers?.["x-retry-count"], 1);
                assert.equal(retry.content.toString(), pendingBody.toString());
                // new
                assert.equal(retry.fields.routingKey, SETTLEMENT_MESSAGING.queue);
                assert.equal(
                    retry.properties.headers?.["x-original-routing-key"],
                    SETTLEMENT_MESSAGING.routingKeys.ORDER_RECEIVED,
                );
                await grantInitialCredits(prisma, pending.event.courierId); await processSettlementMessage(prisma, channel, retry);
                const contradictory = { ...pending.event, eventId: randomUUID() };
                await publishConfirmed(channel, SETTLEMENT_MESSAGING.exchange, SETTLEMENT_MESSAGING.routingKeys.ORDER_RECEIVED, Buffer.from(JSON.stringify(contradictory)), { messageId: contradictory.eventId });
                await processSettlementMessage(prisma, channel, await get(SETTLEMENT_MESSAGING.queue));
                const dead = await get(SETTLEMENT_MESSAGING.deadQueue); assert.equal(dead.properties.headers?.["x-credit-failure"], "CONFLICT"); channel.ack(dead);
                await channel.checkQueue(SETTLEMENT_MESSAGING.deadQueue);
                const recover = await held(); recover.event.courierId = randomUUID(); const recoverBody = Buffer.from(JSON.stringify(recover.event));
                await publishConfirmed(channel, "", SETTLEMENT_MESSAGING.deadQueue, recoverBody, { messageId: recover.event.eventId, headers: { "x-retry-count": 5 } });
                await grantInitialCredits(prisma, recover.event.courierId);
                const child = spawn(process.execPath, ["--import", "tsx", "src/scripts/redrive-settlement.ts", "--limit", "1"], { cwd: new URL("../", import.meta.url), env: process.env, stdio: "pipe" });
                let redriveOutput = ""; child.stdout.on("data", data => { redriveOutput += data.toString(); });
                const exitCode = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }); assert.equal(exitCode, 0); assert.match(redriveOutput, /forwarded: 1/);
                const redriven = await get(SETTLEMENT_MESSAGING.queue); assert.equal(redriven.content.toString(), recoverBody.toString()); assert.equal(redriven.properties.headers?.["x-retry-count"], 0);
                await processSettlementMessage(prisma, channel, redriven);
                // Real connection loss after commit returns the unacknowledged delivery.
                const lost = await held();
                await publishConfirmed(channel, SETTLEMENT_MESSAGING.exchange, SETTLEMENT_MESSAGING.routingKeys.ORDER_RECEIVED, Buffer.from(JSON.stringify(lost.event)), { messageId: lost.event.eventId });
                const crashed = await connectSettlementMessaging();
                const unacked = await crashed.channel.get(SETTLEMENT_MESSAGING.queue, { noAck: false });
                assert.ok(unacked); await transferCredits(prisma, JSON.parse(unacked.content.toString()));
                await crashed.connection.close();
                const replay = await get(SETTLEMENT_MESSAGING.queue); assert.equal(replay.fields.redelivered, true);
                await processSettlementMessage(prisma, channel, replay);
                assert.deepEqual(await balances(lost.event.requesterId, lost.event.courierId), [40, 0, 60, 0]);
                assert.equal(await prisma.creditTransaction.count({ where: { reservationId: lost.event.reservationId } }), 3);
                for (const eventType of ["ORDER_CANCELED", "ORDER_EXPIRED", "ORDER_FAILED"] as const) {
                    const { event } = await held(); const release = releaseEvent(event, eventType);
                    const releaseBody = Buffer.from(JSON.stringify(release)); const route = SETTLEMENT_MESSAGING.routingKeys[eventType];
                    await publishConfirmed(channel, SETTLEMENT_MESSAGING.exchange, route, releaseBody, { messageId: release.eventId });
                    const delivery = await get(SETTLEMENT_MESSAGING.queue); assert.equal(delivery.fields.routingKey, route);
                    assert.equal(await channel.get(REGISTRATION_MESSAGING.queue, { noAck: false }), false);
                    await processSettlementMessage(prisma, channel, delivery);
                    assert.deepEqual(await balances(event.requesterId, event.courierId), [50, 0, 50, 0]);
                    await publishConfirmed(channel, SETTLEMENT_MESSAGING.exchange, route, Buffer.from(JSON.stringify({ ...release, eventId: randomUUID() })), { messageId: randomUUID() });
                    await processSettlementMessage(prisma, channel, await get(SETTLEMENT_MESSAGING.queue));
                    const invalid = await get(SETTLEMENT_MESSAGING.deadQueue); assert.equal(invalid.properties.headers?.["x-credit-failure"], "INVALID_EVENT", JSON.stringify({ headers: invalid.properties.headers, body: invalid.content.toString() })); channel.ack(invalid);
                    await channel.checkQueue(SETTLEMENT_MESSAGING.deadQueue);
                    const recover = await held(); const redriveEvent = releaseEvent(recover.event, eventType); const redriveBody = Buffer.from(JSON.stringify(redriveEvent));
                    await publishConfirmed(channel, "", SETTLEMENT_MESSAGING.deadQueue, redriveBody, { messageId: redriveEvent.eventId, headers: { "x-retry-count": 5 } });
                    const child = spawn(process.execPath, ["--import", "tsx", "src/scripts/redrive-settlement.ts", "--limit", "1"], { cwd: new URL("../", import.meta.url), env: process.env, stdio: "pipe" });
                    let redriveOutput = ""; child.stdout.on("data", data => { redriveOutput += data.toString(); });
                    const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); }); assert.equal(code, 0); assert.match(redriveOutput, /forwarded: 1/);
                    const redriven = await get(SETTLEMENT_MESSAGING.queue); assert.equal(redriven.fields.routingKey, route); assert.equal(redriven.content.toString(), redriveBody.toString());
                    await processSettlementMessage(prisma, channel, redriven);
                    assert.equal((await getReservation(redriveEvent.reservationId)).status, eventType === "ORDER_FAILED" ? "REFUNDED" : "RELEASED");
                }
                const unroutable = await connectSettlementMessaging();
                try {
                    await assert.rejects(
                        publishConfirmed(unroutable.channel, SETTLEMENT_MESSAGING.exchange, "unrouted.v1", body, { messageId: event.eventId }),
                        /unroutable/,
                    );
                } finally { await unroutable.connection.close().catch(() => undefined); }
                const background = await held(); const stop = startSettlementConsumer(prisma);
                try {
                    await publishConfirmed(channel, SETTLEMENT_MESSAGING.exchange, SETTLEMENT_MESSAGING.routingKeys.ORDER_RECEIVED, Buffer.from(JSON.stringify(background.event)), { messageId: background.event.eventId });
                    const deadline = Date.now() + 10_000;
                    while ((await getReservation(background.event.reservationId)).status !== "TRANSFERRED" && Date.now() < deadline) await delay(100);
                    assert.equal((await getReservation(background.event.reservationId)).status, "TRANSFERRED");
                } finally { await stop(); }
            } finally {
                await connection.close(); if (previous === undefined) delete process.env.RABBITMQ_URL; else process.env.RABBITMQ_URL = previous;
            }
        });
    } finally {
        await prisma.$disconnect();
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
    }
});
