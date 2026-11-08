// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated the registration consumer: event validation, x-retry-count handling, forwarding transient failures to the retry queue and invalid events to the dead queue, and ack-after-forward.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { setTimeout as delay } from "node:timers/promises";
import type { ConsumeMessage, ConfirmChannel } from "amqplib";
import type { PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../errors/errors.js";
import { registrationEventSchema } from "../schemas/registration-event.schema.js";
import { grantInitialCredits } from "./credit.service.js";
import {
    connectRegistrationMessaging,
    publishConfirmed,
    REGISTRATION_MESSAGING,
} from "../libs/rabbitmq.js";
import { MAX_RETRIES } from "../constants/consumer.constant.js";

const transientCodes = new Set([
    "P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "P2034", "P2037",
    "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "EAI_AGAIN",
    "40001", "40P01", "53300", "57014", "57P01", "57P02", "57P03",
]);
const transientKinds = new Set([
    "DatabaseNotReachable", "ConnectionClosed", "SocketTimeout",
    "TransactionWriteConflict", "TooManyConnections",
]);
// pg/pg-pool also emit these transport failures without a structured code.
const transientMessages = new Set([
    "timeout exceeded when trying to connect",
    "Connection terminated due to connection timeout",
    "Connection terminated",
    "Connection terminated unexpectedly",
    "Query read timeout",
]);

function record(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function isTransient(error: unknown): boolean {
    if (error instanceof AppError) return false;
    const root = record(error);
    const adapter = record(record(root.meta).driverAdapterError);
    // Prisma 7 may expose pg errors directly or through its adapter metadata.
    return [root, record(root.cause), adapter, record(adapter.cause)].some(value => {
        const code = value.code ?? value.errorCode ?? value.originalCode;
        return (typeof code === "string" && (transientCodes.has(code) || /^08[0-9A-Z]{3}$/.test(code)))
            || (typeof value.kind === "string" && transientKinds.has(value.kind))
            || (typeof value.message === "string" && transientMessages.has(value.message));
    });
}

async function processMessage(
    prisma: PrismaClient,
    channel: ConfirmChannel,
    message: ConsumeMessage,
): Promise<void> {
    let payload: unknown;
    try {
        payload = JSON.parse(message.content.toString("utf8"));
    } catch {
        payload = null;
    }
    const parsed = registrationEventSchema.safeParse(payload);
    const header = message.properties.headers?.["x-retry-count"];
    const retryCount: unknown = header === undefined ? 0 : header;
    const validRetry = typeof retryCount === "number"
        && Number.isInteger(retryCount) && retryCount >= 0 && retryCount <= MAX_RETRIES;
    // Log only individually validated identifiers, never raw malformed payloads.
    const fields = record(payload);
    const eventId = registrationEventSchema.shape.eventId.safeParse(fields.eventId);
    const userId = registrationEventSchema.shape.userId.safeParse(fields.userId);
    const context = {
        eventId: eventId.success ? eventId.data : null,
        userId: userId.success ? userId.data : null,
        attempt: validRetry ? retryCount + 1 : null,
    };

    const originalKeyHeader = message.properties.headers?.["x-original-routing-key"];
    const viaRetry = message.fields.routingKey === REGISTRATION_MESSAGING.queue;
    const routingKey =
        viaRetry && typeof originalKeyHeader === "string"
            ? originalKeyHeader
            : message.fields.routingKey;

    async function forward(queue: string, reason: string, nextRetry: number | null) {
        try {
            await publishConfirmed(channel, "", queue, message.content, {
                // Preserve body and identity. Do not copy expiration/userId:
                // either could cause a forwarded message to expire or fail.
                messageId: message.properties.messageId,
                contentType: message.properties.contentType ?? "application/json",
                headers: {
                    ...message.properties.headers,
                    "x-original-routing-key":
                        message.properties.headers?.["x-original-routing-key"] ?? message.fields.routingKey,
                    ...(nextRetry === null ? {} : { "x-retry-count": nextRetry }),
                    "x-credit-failure": reason,
                },
            });
            channel.ack(message);
            console.info("Registration consumer", {
                ...context,
                outcome: queue === REGISTRATION_MESSAGING.retryQueue ? "retry_scheduled" : "dead_lettered",
                reason,
            });
        } catch (error) {
            console.warn("Registration consumer", { ...context, outcome: "forward_unconfirmed" });
            throw error; // Leave the original unacknowledged; reconnect requeues it.
        }
    }

    if (
        !parsed.success ||
        message.properties.messageId !== parsed.data.eventId ||
        routingKey !== REGISTRATION_MESSAGING.routingKeys.USER_REGISTERED
    ) {
        await forward(REGISTRATION_MESSAGING.deadQueue, "INVALID_EVENT", null);
        return;
    }

    if (!validRetry) {
        await forward(REGISTRATION_MESSAGING.deadQueue, "INVALID_RETRY_COUNT", null);
        return;
    }

    let created: boolean;
    try {
        ({ created } = await grantInitialCredits(prisma, parsed.data.userId));
    } catch (error) {
        const transient = isTransient(error);
        if (transient && retryCount < MAX_RETRIES) {
            await forward(REGISTRATION_MESSAGING.retryQueue, "TRANSIENT_DATABASE_FAILURE", retryCount + 1);
        } else {
            const reason = transient ? "RETRIES_EXHAUSTED"
                : error instanceof AppError ? error.code : "NON_RETRYABLE_FAILURE";
            await forward(REGISTRATION_MESSAGING.deadQueue, reason, null);
        }
        return;
    }
    // Keep ack failures outside the grant catch: a committed grant must never
    // become a new application retry just because its acknowledgment was lost.
    channel.ack(message);
    console.info("Registration consumer", { ...context, outcome: created ? "granted" : "already_granted" });
}

/** One in-flight delivery; HTTP startup does not await broker availability. */
export function startRegistrationConsumer(prisma: PrismaClient): () => Promise<void> {
    const abort = new AbortController();

    async function runSession(): Promise<void> {
        const { connection, channel } = await connectRegistrationMessaging();
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
            const consumer = await channel.consume(REGISTRATION_MESSAGING.queue, message => {
                if (!message) { end(); return; } // Broker cancelled the consumer.
                if (ending) return; // Requeue on close; do not begin new work.
                inFlight = processMessage(prisma, channel, message).catch(() => {
                    console.warn("Registration consumer", { outcome: "delivery_unacknowledged" });
                    end();
                });
            }, { noAck: false });
            consumerTag = consumer.consumerTag;
            console.info("Registration consumer", { outcome: "connected" });
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
                console.warn("Registration consumer", { outcome: "connection_retry" });
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
