// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Replaced console.* with the pino logger.
// Author review: Reviewed, tested, checked by the author.

import { setTimeout as delay } from "node:timers/promises";
import type { ConsumeMessage, ConfirmChannel } from "amqplib";
import { AppError } from "../errors/errors.js";
import {
    connectReservationResultMessaging,
    publishConfirmed,
    RESERVATION_RESULT_MESSAGING,
} from "../libs/rabbitmq.js";
import {
    creditReservationResultSchema,
    type CreditReservationResult,
} from "../schemas/credit-reservation-result.schema.js";
import { creditReservationResultService } from "../services/credit-reservation-result.service.js";
import { logger } from "../libs/logger.js";

export const MAX_RESULT_BYTES = 65_536;
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

function getExpectedRoutingKey(event: CreditReservationResult): string {
    return RESERVATION_RESULT_MESSAGING.routingKeys[event.eventType];
}

async function forwardMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    queue: string,
    reason: string,
    nextRetryCount: number | null,
): Promise<void> {
    await publishConfirmed(channel, "", queue, message.content, {
        messageId: message.properties.messageId,
        contentType: message.properties.contentType ?? "application/json",
        correlationId: message.properties.correlationId,
        headers: {
            ...message.properties.headers,
            "x-original-routing-key":
                message.properties.headers?.["x-original-routing-key"] ?? message.fields.routingKey,
            ...(nextRetryCount === null ? {} : { "x-retry-count": nextRetryCount }),
            "x-order-failure": reason.slice(0, 500),
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

export async function processCreditReservationResultMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
): Promise<void> {
    let body: unknown;

    // 1. Parse and size-check the message body.
    try {
        if (message.content.length > MAX_RESULT_BYTES) {
            throw new Error("MESSAGE_TOO_LARGE");
        }

        body = JSON.parse(message.content.toString("utf8"));
    } catch {
        await forwardMessage(
            channel,
            message,
            RESERVATION_RESULT_MESSAGING.deadQueue,
            "INVALID_EVENT",
            null,
        );
        return;
    }

    // 2. Validate the event, retry count, message ID and routing key.
    const parsed = creditReservationResultSchema.safeParse(body);
    const retryCount = getRetryCount(message);
    const originalKeyHeader = message.properties.headers?.["x-original-routing-key"];
    const viaRetry = message.fields.routingKey === RESERVATION_RESULT_MESSAGING.queue;
    const routingKey =
        viaRetry && typeof originalKeyHeader === "string"
            ? originalKeyHeader
            : message.fields.routingKey;

    if (
        !parsed.success ||
        message.properties.messageId !== parsed.data.eventId ||
        routingKey !== getExpectedRoutingKey(parsed.data)
    ) {
        await forwardMessage(
            channel,
            message,
            RESERVATION_RESULT_MESSAGING.deadQueue,
            "INVALID_EVENT",
            null,
        );
        return;
    }

    if (retryCount === null) {
        await forwardMessage(
            channel,
            message,
            RESERVATION_RESULT_MESSAGING.deadQueue,
            "INVALID_RETRY_COUNT",
            null,
        );
        return;
    }

    try {
        // 3. Apply the result transactionally. This also records the inbox
        // event, making a redelivery after a commit safe.
        await creditReservationResultService(parsed.data);

        channel.ack(message);

        logger.info({
            eventId: parsed.data.eventId,
            orderId: parsed.data.orderId,
            requestType: parsed.data.requestType,
            outcome: "processed",
        }, "Credit reservation result");
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
                RESERVATION_RESULT_MESSAGING.retryQueue,
                "PROCESSING_FAILED",
                retryCount + 1,
            );
        } else {
            await forwardMessage(
                channel,
                message,
                RESERVATION_RESULT_MESSAGING.deadQueue,
                "RETRIES_EXHAUSTED",
                null,
            );
        }

        logger.warn({
            eventId: parsed.data.eventId,
            orderId: parsed.data.orderId,
            retryCount,
        }, "Credit reservation result processing failed");
    }
}

/** Starts the consumer in the background and returns a graceful stop function. */
export function startCreditReservationResultConsumer():
    () => Promise<void> {
    const abort = new AbortController();

    async function runSession(): Promise<void> {
        const { connection, channel } =
            await connectReservationResultMessaging();

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
                RESERVATION_RESULT_MESSAGING.queue,
                (message) => {
                    if (!message) {
                        end();
                        return;
                    }

                    if (ending) return;

                    inFlight = processCreditReservationResultMessage(
                        channel,
                        message,
                    ).catch(() => {
                        logger.warn("Credit reservation result left unacknowledged");
                        end();
                    });
                },
                { noAck: false },
            );

            consumerTag = consumer.consumerTag;
            logger.info("Credit reservation result consumer connected");
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
                logger.warn("Credit reservation result consumer reconnecting");
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
                        "Credit result consumer reconnect delay failed",
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