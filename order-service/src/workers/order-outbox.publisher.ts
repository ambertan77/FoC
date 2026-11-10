// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Replaced console.* with the pino logger.
// Author review: Reviewed, tested, checked by Duong Ngoc Mai.

// Code Reference:
// "Transactional Outbox Pattern in Node.js: Building Reliable ..."
// LinkedIn, https://www.linkedin.com/pulse/transactional-outbox-pattern-nodejs-building-reliable-sex5c/
// Used for: Transactional outbox polling, event claiming, retries, and reliable message publishing.

import { setTimeout as delay } from "node:timers/promises";
import { OrderEventType, OutboxEventStatus } from "../generated/prisma/client.js";
import {
    connectOrderMessaging,
    ORDER_PUBLISH_ROUTES,
    publishConfirmed,
    type PublishableOrderEventType,
} from "../libs/rabbitmq.js";
import { prisma } from "../libs/prisma.js";
import { logger } from "../libs/logger.js";

// Maximum number of outbox events to fetch and publish in a single batch.
const BATCH_SIZE = 30;

// Polling interval for checking the outbox for new events to publish.
const POLL_INTERVAL_MS = 30_000;

// Maximum backoff time for retrying failed outbox event publications.
const MAX_BACKOFF_MS = 60_000;

// Controls how long a claimed row stays reserved for the current publisher before it can be claimed by another publisher.
const CLAIM_LEASE_MS = 30_000;

// Maximum number of retries before marking an outbox event as dead.
const MAX_RETRIES = 5;

type ClaimedEvent = {
    id: string;
    orderId: string;
    eventType: OrderEventType;
    payload: unknown;
    retryCount: number;
    lockedUntil: Date;
};

/**
 * The SQL:
 * - Finds due PENDING rows and PROCESSING rows whose lease has expired.
 * - Locks them for update to prevent other publishers from claiming them.
 * - Updates their status to PROCESSING and sets a new lease expiration time.
 * - Returns the claimed rows for processing.
 * This is done in a single transaction to ensure atomicity and prevent race conditions.
 */
async function claimBatch(): Promise<ClaimedEvent[]> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS);

    return prisma.$transaction(async (tx) => {
        return tx.$queryRaw<ClaimedEvent[]>`
            WITH candidates AS (
                SELECT "id"
                FROM "OutboxEvent"
                WHERE
                    (
                        "status" = 'PENDING'::"OutboxEventStatus"
                        AND "nextAttemptAt" <= ${now}
                    )
                    OR (
                        "status" = 'PROCESSING'::"OutboxEventStatus"
                        AND (
                            "lockedUntil" IS NULL
                            OR "lockedUntil" <= ${now}
                        )
                    )
                ORDER BY "createdAt" ASC, "id" ASC
                FOR UPDATE SKIP LOCKED
                LIMIT ${BATCH_SIZE}
            )
            UPDATE "OutboxEvent" AS event
            SET
                "status" = 'PROCESSING'::"OutboxEventStatus",
                "lockedUntil" = ${leaseUntil}
            FROM candidates
            WHERE event."id" = candidates."id"
            RETURNING
                event."id",
                event."orderId",
                event."eventType",
                event."payload",
                event."retryCount",
                event."lockedUntil"
        `;
    });
}

// Serialize the payload of an outbox event to a Buffer for publishing to RabbitMQ.
function serializePayload(payload: unknown, eventId: string): Buffer {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        throw new Error("INVALID_OUTBOX_PAYLOAD");
    }

    const record = payload as Record<string, unknown>;
    if (record.eventId !== eventId) {
        throw new Error("OUTBOX_EVENT_ID_MISMATCH");
    }

    return Buffer.from(JSON.stringify(record), "utf8");
}

export function isPublishableOrderEventType(
    eventType: OrderEventType,
): eventType is PublishableOrderEventType {
    return Object.prototype.hasOwnProperty.call(ORDER_PUBLISH_ROUTES, eventType);
}

// Use a random jitter to help avoid simultaneous retries from multiple workers.
function backoffMs(retryCount: number): number {
    const exponential = Math.min(1_000 * 2 ** Math.max(0, retryCount - 1), MAX_BACKOFF_MS);
    const jitter = Math.floor(Math.random() * 500);
    return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}

async function publishOne(
    event: ClaimedEvent,
    channel: Awaited<ReturnType<typeof connectOrderMessaging>>["channel"],
): Promise<void> {
    // 1. Validate that the event type is publishable before attempting to publish it.
    // 2. If not, mark the outbox event as DEAD and return early.
    if (!isPublishableOrderEventType(event.eventType)) {
        await prisma.outboxEvent.updateMany({
            where: {
                id: event.id,
                status: OutboxEventStatus.PROCESSING,
                lockedUntil: event.lockedUntil, // Ensure we only update if the lease is still valid.
            },
            data: {
                status: OutboxEventStatus.DEAD,
                lockedUntil: null,
                lastError: "UNSUPPORTED_EVENT_TYPE",
            },
        });
        return;
    }

    // 3. Get the routing key for the event type from the routingKeys mapping.
    const { exchange, routingKey } = ORDER_PUBLISH_ROUTES[event.eventType];

    try {
        // 4. Publish the event to RabbitMQ with publisher confirms.
        await publishConfirmed(
            channel,
            exchange,
            routingKey,
            serializePayload(event.payload, event.id),
            { messageId: event.id, correlationId: event.orderId },
        );

        // 5. If successful, update the outbox event status to PUBLISHED and clear the lease.
        await prisma.outboxEvent.updateMany({
            where: {
                id: event.id,
                status: OutboxEventStatus.PROCESSING,
                lockedUntil: event.lockedUntil
            },
            data: {
                status: OutboxEventStatus.PUBLISHED,
                publishedAt: new Date(),
                lockedUntil: null, // Clear the lease after successful publication.
                lastError: null,
            },
        });
        logger.info({
            eventId: event.id,
            orderId: event.orderId,
            eventType: event.eventType,
        }, "Outbox event published successfully");

    } catch (error) {
        const nextRetryCount = event.retryCount + 1;
        const dead = nextRetryCount >= MAX_RETRIES;

        // 6. If publishing fails, update the outbox event status to PENDING or DEAD, 
        // increment the retry count, and set the next attempt time with backoff.
        await prisma.outboxEvent.updateMany({
            where: {
                id: event.id,
                status: OutboxEventStatus.PROCESSING,
                lockedUntil: event.lockedUntil
            },
            data: {
                status: dead
                    ? OutboxEventStatus.DEAD
                    : OutboxEventStatus.PENDING,
                retryCount: nextRetryCount,
                nextAttemptAt: new Date(Date.now() + backoffMs(nextRetryCount)),
                lockedUntil: null,
                lastError: error instanceof Error
                    ? error.message.slice(0, 1_000)
                    : "UNKNOWN_PUBLISH_ERROR",
            },
        });

        logger.error({
            eventId: event.id,
            retryCount: nextRetryCount,
            dead,
        }, "Outbox publish failed");

        // Reconnect before the next publish when the channel may be unhealthy.
        throw error;
    }
}

export function startOrderOutboxPublisher(): () => Promise<void> {
    const abortController = new AbortController();

    const run = async () => {
        let retry = 0; // Track the number of consecutive failures for backoff.

        while (!abortController.signal.aborted) {
            let connection:
                | Awaited<ReturnType<typeof connectOrderMessaging>>["connection"]
                | undefined;
            let channel:
                | Awaited<ReturnType<typeof connectOrderMessaging>>["channel"]
                | undefined;

            try {
                // Claim a batch of outbox events to publish.
                const events = await claimBatch();

                if (events.length === 0) {
                    logger.debug("No outbox events to publish; waiting for next poll");
                    await delay(POLL_INTERVAL_MS, undefined, {
                        signal: abortController.signal
                    });
                    continue;
                }

                // Connect only now that there is something to publish.
                const messaging = await connectOrderMessaging();
                connection = messaging.connection;
                channel = messaging.channel;
                retry = 0;

                // Publish each claimed event sequentially to ensure order and avoid concurrent publishes on the same channel.
                for (const event of events) {
                    if (abortController.signal.aborted) {
                        break;
                    }
                    await publishOne(event, channel);
                }
            } catch (error) {
                if (!abortController.signal.aborted) {
                    retry++;
                    logger.error({
                        retry,
                        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
                    }, "Outbox publisher iteration failed");

                    await delay(backoffMs(retry), undefined, {
                        signal: abortController.signal
                    }).catch(() => undefined);
                }
            } finally {
                await channel?.close().catch(() => undefined);
                await connection?.close().catch(() => undefined);
            }
        }
    };

    const completion = run();

    return async () => {
        abortController.abort();
        await completion;
    };
}