// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Replaced console.* with the pino logger.
// Author review: Pending review by the author.

import { setTimeout as delay } from "node:timers/promises";
import type { ConfirmChannel, ConsumeMessage } from "amqplib";
import {
    connectOrderStatusMessaging,
    ORDER_STATUS_MESSAGING,
    publishConfirmed,
} from "../libs/rabbitmq.js";
import { orderStatusEventSchema } from "../schemas/order-status-event.schema.js";
import { handleOrderStatusEvent } from "../services/notification.service.js";
import { AppError } from "../errors/errors.js";
import { logger } from "../libs/logger.js";

const MAX_RESULT_BYTES = 65_536;
const MAX_RETRIES = 5;

function getRetryCount(message: ConsumeMessage): number | null {
    const value = message.properties.headers?.["x-retry-count"] ?? 0;

    return typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= MAX_RETRIES
        ? value
        : null;
}

/** forwardMessages to the retry or dead queue, then acks the original only after the broker confirms. */
async function forwardMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    queue: string,
    reason: string,
    nextRetryCount: number | null,
): Promise<void> {
    const headers = message.properties.headers ?? {};
    await publishConfirmed(channel, "", queue, message.content, {
        messageId: message.properties.messageId,
        contentType: message.properties.contentType ?? "application/json",
        headers: {
            ...headers,
            // A retry returns by queue name, so remember the real routing key.
            "x-original-routing-key":
                headers["x-original-routing-key"] ?? message.fields.routingKey,
            ...(nextRetryCount === null ? {} : { "x-retry-count": nextRetryCount }),
            "x-notification-failure": reason,
        },
    });

    // Ack the source message only after RabbitMQ confirms the forwarded copy.
    channel.ack(message);
}


function isTemporaryServiceError(error: unknown): boolean {
    // The result service should wrap a known temporary database outage in
    // AppError(..., 503). Reconnect without using up this message's retry count.
    return error instanceof AppError && error.statusCode === 503;
}

export async function processOrderStatusMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
): Promise<void> {
    let body: unknown;

    // 1. Parse and size-check the message body.
    try {
        if (message.content.length > MAX_RESULT_BYTES) {
            throw new Error("too large");
        }

        body = JSON.parse(message.content.toString("utf8"));
    } catch {
        await forwardMessage(
            channel,
            message,
            ORDER_STATUS_MESSAGING.deadQueue,
            "INVALID_EVENT",
            null
        );
        return;
    }

    // 2. Validate the event, retry count, message ID and routing key.
    const parsed = orderStatusEventSchema.safeParse(body);
    const retryCount = getRetryCount(message);

    const originalKeyHeader = message.properties.headers?.["x-original-routing-key"];
    const viaRetry = message.fields.routingKey === ORDER_STATUS_MESSAGING.retryQueue;
    const routingKey =
        viaRetry && typeof originalKeyHeader === "string"
            ? originalKeyHeader
            : message.fields.routingKey;

    if (
        !parsed.success ||
        message.properties.messageId !== parsed.data.eventId ||
        routingKey !== ORDER_STATUS_MESSAGING.routingKeys.ORDER_STATUS_CHANGED
    ) {
        await forwardMessage(
            channel,
            message,
            ORDER_STATUS_MESSAGING.deadQueue,
            "INVALID_EVENT",
            null
        );
        return;
    }

    if (retryCount === null) {
        await forwardMessage(
            channel,
            message,
            ORDER_STATUS_MESSAGING.deadQueue,
            "INVALID_RETRY_COUNT",
            null
        );
        return;
    }

    try {
        // 3. Apply the result transactionally.
        const created = await handleOrderStatusEvent(parsed.data);

        channel.ack(message); // after commit; a lost ack only causes a harmless redelivery

        logger.info({
            eventId: parsed.data.eventId,
            notifications: created
        }, "Order status event");
    } catch (error) {
        // A temporary database outage should reconnect and let RabbitMQ
        // redeliver this unacked message, without spending its retry budget.
        if (isTemporaryServiceError(error)) {
            throw error;
        }

        if (retryCount < MAX_RETRIES) {
            await forwardMessage(
                channel,
                message,
                ORDER_STATUS_MESSAGING.retryQueue,
                "PROCESSING_FAILED",
                retryCount + 1,
            );
        } else {
            await forwardMessage(
                channel,
                message,
                ORDER_STATUS_MESSAGING.deadQueue,
                "RETRIES_EXHAUSTED",
                null,
            );
        }

        logger.warn({
            eventId: parsed.data.eventId,
            orderId: parsed.data.orderId,
            retryCount,
        }, "Order status event processing failed");
    }
}

/** Starts the consumer in the background and returns a graceful stop function. */
export function startOrderStatusConsumer():
    () => Promise<void> {
    const abort = new AbortController();

    async function runSession(): Promise<void> {
        const { connection, channel } = await connectOrderStatusMessaging();

        let ending = false;
        let finish!: () => void;

        const finished = new Promise<void>((resolve) => {
            finish = resolve;
        });

        const end = () => {
            ending = true;
            finish();
        };

        let inFlight = Promise.resolve();
        let consumerTag: string | undefined;

        connection.once("close", end);
        channel.once("close", end);
        abort.signal.addEventListener("abort", end, { once: true });

        try {
            if (abort.signal.aborted) return;

            await channel.prefetch(1);

            const consumer = await channel.consume(
                ORDER_STATUS_MESSAGING.queue,
                (message) => {
                    if (!message) {
                        end();
                        return;
                    }

                    if (ending) return;

                    inFlight = processOrderStatusMessage(channel, message)
                        .catch(() => {
                            logger.warn("Order status delivery left unacknowledged");
                            end(); // reconnect; RabbitMQ redelivers the unacked message
                        });
                },
                { noAck: false },
            );

            consumerTag = consumer.consumerTag;
            logger.info("Order status consumer connected");
            await finished;
        } finally {
            ending = true;
            abort.signal.removeEventListener("abort", end);

            if (consumerTag) {
                await channel.cancel(consumerTag).catch(() => undefined);
            }

            // Let an active transaction finish. Closing the connection returns
            // any still-unacknowledged message to RabbitMQ.
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
                logger.warn("Order status consumer reconnecting");
            }

            if (abort.signal.aborted) break;


            if (Date.now() - startedAt >= 60_000) {
                reconnectAttempts = 0;
            }

            const backoffMs =
                Math.min(2 ** Math.min(reconnectAttempts++, 6), 60) *
                1_000;

            try {
                await delay(backoffMs, undefined, {
                    signal: abort.signal,
                });
            } catch {
                if (!abort.signal.aborted) {
                    throw new Error(
                        "Order status consumer reconnect delay failed",
                    );
                }
            }
        }
    }

    const completion = run();

    return async () => {
        abort.abort();
        await completion;
    };
}