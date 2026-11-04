import { setTimeout as delay } from "node:timers/promises";
import type { ConsumeMessage, ConfirmChannel } from "amqplib";
import type { PrismaClient } from "../generated/prisma/client.js";
import { AppError } from "../errors/errors.js";
import { isTemporaryDatabaseError } from "../libs/credit-transaction.js";
import {
    connectReservationRequestMessaging,
    publishConfirmed,
    RESERVATION_REQUEST_MESSAGING,
} from "../libs/rabbitmq.js";
import { reservationRequestEventSchema } from "../schemas/reservation-request-event.schema.js";
import { reservationRequestService } from "../services/reservation-request.service.js";
import { MAX_REQUEST_BYTES, MAX_RETRIES } from "../constants/consumer.constant.js";

function getRetryCount(message: ConsumeMessage): number | null {
    const value = message.properties.headers?.["x-retry-count"] ?? 0;

    return typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= MAX_RETRIES
        ? value
        : null;
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
            ...(nextRetryCount === null
                ? {}
                : { "x-retry-count": nextRetryCount }),
            "x-credit-failure": reason,
        },
    });

    // Acknowledge only after RabbitMQ confirms the forwarding publish.
    channel.ack(message);
}

export async function processReservationRequestMessage(
    prisma: PrismaClient,
    channel: ConfirmChannel,
    message: ConsumeMessage,
): Promise<void> {
    let body: unknown;
    const originalKeyHeader = message.properties.headers?.["x-original-routing-key"];
    const viaRetry = message.fields.routingKey === RESERVATION_REQUEST_MESSAGING.queue;
    const routingKey =
        viaRetry && typeof originalKeyHeader === "string"
            ? originalKeyHeader
            : message.fields.routingKey;

    // 1. Parse the message content as JSON and check its size.
    try {
        if (message.content.length > MAX_REQUEST_BYTES) {
            throw new Error("Oversized reservation request");
        }
        body = JSON.parse(message.content.toString("utf8"));
    } catch {
        await forwardMessage(
            channel,
            message,
            RESERVATION_REQUEST_MESSAGING.deadQueue,
            "INVALID_EVENT",
            null,
        );
        return;
    }

    // 2. Validate the parsed body against the reservation request event schema.
    const parsed = reservationRequestEventSchema.safeParse(body);
    const retryCount = getRetryCount(message);

    // 3. If the message is invalid or the retry count is invalid, forward it to the dead-letter queue.
    if (
        !parsed.success ||
        message.properties.messageId !== parsed.data.eventId ||
        routingKey !== RESERVATION_REQUEST_MESSAGING.routingKeys.CREDIT_RESERVATION_REQUEST
    ) {
        await forwardMessage(
            channel,
            message,
            RESERVATION_REQUEST_MESSAGING.deadQueue,
            "INVALID_EVENT",
            null,
        );
        return;
    }

    if (retryCount === null) {
        await forwardMessage(
            channel,
            message,
            RESERVATION_REQUEST_MESSAGING.deadQueue,
            "INVALID_RETRY_COUNT",
            null,
        );
        return;
    }

    try {
        // 4. Process the reservation request.
        await reservationRequestService(prisma, parsed.data);

        // The transaction has recorded the request outcome and result outbox
        // event. A separate outbox publisher will publish that result.
        channel.ack(message);
        console.info("Reservation request", {
            eventId: parsed.data.eventId,
            orderId: parsed.data.orderId,
            outcome: "processed",
        });
    } catch (error) {
        // 5. If the processing fails, either retry or forward to the dead-letter queue.
        // Pause and reconnect during a temporary database outage instead of
        // consuming this individual message's retry budget.
        if (
            error instanceof AppError &&
            error.statusCode === 503 &&
            isTemporaryDatabaseError(error.cause)
        ) {
            throw error;
        }

        // Retry if the error is not a permanent failure and the retry count has not been exhausted.
        if (retryCount < MAX_RETRIES) {
            await forwardMessage(
                channel,
                message,
                RESERVATION_REQUEST_MESSAGING.retryQueue,
                "PROCESSING_FAILED",
                retryCount + 1,
            );
        } else {
            await forwardMessage(
                channel,
                message,
                RESERVATION_REQUEST_MESSAGING.deadQueue,
                "RETRIES_EXHAUSTED",
                null,
            );
        }

        console.warn("Reservation request processing failed", {
            eventId: parsed.data.eventId,
            orderId: parsed.data.orderId,
            retryCount,
        });
    }
}

/** Starts the consumer in the background and returns a graceful stop function. */
export function startReservationRequestConsumer(
    prisma: PrismaClient,
): () => Promise<void> {
    const abort = new AbortController();

    async function runSession(): Promise<void> {
        const { connection, channel } =
            await connectReservationRequestMessaging();

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
                RESERVATION_REQUEST_MESSAGING.queue,
                (message) => {
                    if (!message) {
                        end();
                        return;
                    }

                    if (ending) return;

                    inFlight = processReservationRequestMessage(
                        prisma,
                        channel,
                        message,
                    ).catch(() => {
                        console.warn("Reservation request delivery left unacknowledged");
                        end();
                    });
                },
                { noAck: false },
            );

            consumerTag = consumer.consumerTag;
            console.info("Reservation request consumer connected");
            await finished;
        } finally {
            ending = true;
            abort.signal.removeEventListener("abort", end);

            if (consumerTag) {
                await channel.cancel(consumerTag).catch(() => undefined);
            }

            // Finish any database transaction already in progress. Closing the
            // connection returns an unacknowledged message to RabbitMQ.
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
                console.warn("Reservation request consumer reconnecting");
            }

            if (abort.signal.aborted) break;

            if (Date.now() - startedAt >= 60_000) {
                reconnectAttempts = 0;
            }

            const backoffMs =
                Math.min(2 ** Math.min(reconnectAttempts++, 6), 60) * 1_000;

            try {
                await delay(backoffMs, undefined, {
                    signal: abort.signal,
                });
            } catch {
                if (!abort.signal.aborted) {
                    throw new Error("Reservation consumer reconnect delay failed");
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