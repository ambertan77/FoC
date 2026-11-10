// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Replaced console.* with the pino logger.
// Author review: Reviewed, tested, checked by Duong Ngoc Mai.

import { setTimeout as delay } from "node:timers/promises";
import type { ConsumeMessage, ConfirmChannel } from "amqplib";
import type { PrismaClient } from "../generated/prisma/client.js";
import { isTemporaryDatabaseError } from "../libs/credit-transaction.js";
import { AppError } from "../errors/errors.js";
import { reservationIdSchema } from "../schemas/reservation.schema.js";
import { settlementEventSchema } from "../schemas/settlement-event.schema.js";
import { refundCredits, releaseCredits, transferCredits } from "./settlement.service.js";
import {
    connectSettlementMessaging,
    publishConfirmed,
    SETTLEMENT_MESSAGING,
} from "../libs/rabbitmq.js";
import { MAX_RETRIES, MAX_SETTLEMENT_BYTES } from "../constants/consumer.constant.js";
import { logger } from "../libs/logger.js";

function record(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export async function processSettlementMessage(
    prisma: PrismaClient,
    channel: ConfirmChannel,
    message: ConsumeMessage,
): Promise<void> {
    let payload: unknown;
    try {
        if (message.content.length > MAX_SETTLEMENT_BYTES) throw new Error("Oversized event");
        payload = JSON.parse(message.content.toString("utf8"));
    } catch {
        payload = null;
    }
    const parsed = settlementEventSchema.safeParse(payload);
    const header = message.properties.headers?.["x-retry-count"];
    const retryCount: unknown = header === undefined ? 0 : header;
    const validRetry = typeof retryCount === "number"
        && Number.isInteger(retryCount) && retryCount >= 0 && retryCount <= MAX_RETRIES;
    // Log only individually validated identifiers, never raw malformed payloads.
    const fields = record(payload);
    const eventId = reservationIdSchema.safeParse(fields.eventId);
    const reservationId = reservationIdSchema.safeParse(fields.reservationId);
    const orderId = reservationIdSchema.safeParse(fields.orderId);
    const startedAt = Date.now();
    const context = {
        eventId: eventId.success ? eventId.data : null,
        reservationId: reservationId.success ? reservationId.data : null,
        orderId: orderId.success ? orderId.data : null,
        attempt: validRetry ? retryCount + 1 : null,
    };

    async function forward(queue: string, reason: string, nextRetry: number | null) {
        try {
            await publishConfirmed(channel, "", queue, message.content, {
                // Preserve body and identity. Do not copy expiration/userId:
                // either could cause a forwarded message to expire or fail.
                messageId: message.properties.messageId,
                contentType: message.properties.contentType ?? "application/json",
                headers: {
                    ...message.properties.headers,
                    ...(nextRetry === null ? {} : { "x-retry-count": nextRetry }),
                    "x-credit-failure": reason,
                    "x-original-routing-key":
                        message.properties.headers?.["x-original-routing-key"] ?? message.fields.routingKey,
                },
            });
            channel.ack(message);
            logger.info({
                ...context,
                outcome: queue === SETTLEMENT_MESSAGING.retryQueue ? "retry_scheduled" : "dead_lettered",
                reason,
            }, "Settlement consumer");
        } catch (error) {
            logger.warn({ ...context, outcome: "forward_unconfirmed" }, "Settlement consumer");
            throw error; // Leave the original unacknowledged; reconnect requeues it.
        }
    }

    // The existing retry queue dead-letters on the receipt route; retain the
    // original event route in metadata without replacing a durable queue.
    const originalKeyHeader = message.properties.headers?.["x-original-routing-key"];
    const viaRetry = message.fields.routingKey === SETTLEMENT_MESSAGING.queue;
    const routingKey =
        viaRetry && typeof originalKeyHeader === "string"
            ? originalKeyHeader
            : message.fields.routingKey;

    if (!parsed.success || message.properties.messageId !== parsed.data.eventId
        || routingKey !== SETTLEMENT_MESSAGING.routingKeys[parsed.data.eventType]) {
        await forward(SETTLEMENT_MESSAGING.deadQueue, "INVALID_EVENT", null);
        return;
    }
    if (!validRetry) {
        await forward(SETTLEMENT_MESSAGING.deadQueue, "INVALID_RETRY_COUNT", null);
        return;
    }

    let applied: boolean;
    try {
        applied = parsed.data.eventType === "ORDER_RECEIVED"
            ? (await transferCredits(prisma, parsed.data)).transferred
            : parsed.data.eventType === "ORDER_FAILED"
                ? (await refundCredits(prisma, parsed.data)).refunded
                : (await releaseCredits(prisma, parsed.data)).released;
    } catch (error) {
        // Close/reconnect on outages without spending per-event retry budgets.
        if (error instanceof AppError && error.statusCode === 503 && isTemporaryDatabaseError(error.cause)) {
            logger.warn({ ...context, outcome: "database_paused" }, "Settlement consumer");
            throw error;
        }
        const retryable = error instanceof AppError && [404, 503].includes(error.statusCode);
        if (retryable && retryCount < MAX_RETRIES) {
            await forward(SETTLEMENT_MESSAGING.retryQueue, "SETTLEMENT_PENDING", retryCount + 1);
        } else {
            const reason = retryable ? "RETRIES_EXHAUSTED"
                : error instanceof AppError ? error.code : "NON_RETRYABLE_FAILURE";
            await forward(SETTLEMENT_MESSAGING.deadQueue, reason, null);
        }
        return;
    }
    // Ack is outside the transaction catch: redelivery after commit is a no-op.
    channel.ack(message);
    logger.info({ ...context, outcome: applied ? (parsed.data.eventType === "ORDER_RECEIVED" ? "transferred" : parsed.data.eventType === "ORDER_FAILED" ? "refunded" : "released") : "already_settled", durationMs: Date.now() - startedAt }, "Settlement consumer");
}

/** One in-flight delivery; HTTP startup does not await broker availability. */
export function startSettlementConsumer(prisma: PrismaClient): () => Promise<void> {
    const abort = new AbortController();

    async function runSession(): Promise<void> {
        const { connection, channel } = await connectSettlementMessaging();
        let ending = false;
        let finish!: () => void;
        const finished = new Promise<void>(resolve => { finish = resolve; });
        const end = () => { ending = true; finish(); };
        let inFlight = Promise.resolve();
        let consumerTag: string | undefined;
        connection.once("close", end);
        channel.once("close", end);
        abort.signal.addEventListener("abort", end, { once: true });
        try {
            if (abort.signal.aborted) return;
            await channel.prefetch(1);
            const consumer = await channel.consume(SETTLEMENT_MESSAGING.queue, message => {
                if (!message) { end(); return; } // Broker cancelled the consumer.
                if (ending) return; // Requeue on close; do not begin new work.
                inFlight = processSettlementMessage(prisma, channel, message).catch(() => {
                    logger.warn({ outcome: "delivery_unacknowledged" }, "Settlement consumer");
                    end();
                });
            }, { noAck: false });
            consumerTag = consumer.consumerTag;
            logger.info({ outcome: "connected" }, "Settlement consumer");
            await finished;
        } finally {
            ending = true;
            abort.signal.removeEventListener("abort", end);
            if (consumerTag) await channel.cancel(consumerTag).catch(() => undefined);
            // Complete a started database operation before reconnecting. Closing
            // the connection returns any unacknowledged delivery to RabbitMQ.
            await inFlight;
            await connection.close().catch(() => undefined);
        }
    }

    async function run(): Promise<void> {
        let reconnectAttempts = 0;
        while (!abort.signal.aborted) {
            const startedAt = Date.now();
            try {
                await runSession();
            } catch {
                logger.warn({ outcome: "connection_retry" }, "Settlement consumer");
            }
            if (abort.signal.aborted) break;
            if (Date.now() - startedAt >= 60_000) reconnectAttempts = 0;
            const backoff = Math.min(2 ** Math.min(reconnectAttempts++, 6), 60) * 1_000;
            try {
                await delay(backoff, undefined, { signal: abort.signal });
            } catch {
                if (!abort.signal.aborted) throw new Error("Consumer reconnect delay failed");
            }
        }
    }

    const completion = run();
    return async () => {
        abort.abort();
        await completion;
    };
}
