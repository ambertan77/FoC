// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Replaced console.* with the pino logger.
// Author review: Pending review by the author.

import { setTimeout as delay } from "node:timers/promises";
import {
    CreditOutboxEventStatus,
    CreditOutboxEventType,
} from "../generated/prisma/client.js";
import { prisma } from "../libs/prisma.js";
import {
    connectReservationResultMessaging,
    publishConfirmed,
    RESERVATION_RESULT_MESSAGING,
} from "../libs/rabbitmq.js";
import { logger } from "../libs/logger.js";

// Maximum number of outbox events to fetch and publish in one batch.
const BATCH_SIZE = 30;

// How often to check for new events when none are available.
const POLL_INTERVAL_MS = 30_000;

// Maximum delay between retries.
const MAX_BACKOFF_MS = 60_000;

// How long a claimed row is reserved for this publisher.
const CLAIM_LEASE_MS = 30_000;

// Maximum failed publishing attempts before marking an event DEAD.
const MAX_RETRIES = 5;

type ClaimedEvent = {
    id: string;
    eventType: CreditOutboxEventType;
    payload: unknown;
    retryCount: number;
    lockedUntil: Date;
};

const routingKeys: Record<CreditOutboxEventType, string> = {
    [CreditOutboxEventType.CREDIT_RESERVATION_SUCCEEDED]:
        RESERVATION_RESULT_MESSAGING.routingKeys.CREDIT_RESERVATION_SUCCEEDED,
    [CreditOutboxEventType.CREDIT_RESERVATION_FAILED]:
        RESERVATION_RESULT_MESSAGING.routingKeys.CREDIT_RESERVATION_FAILED,
};

function isPublishableCreditReservationResultType(
    eventType: CreditOutboxEventType,
): eventType is CreditOutboxEventType {
    return Object.prototype.hasOwnProperty.call(routingKeys, eventType);
}

/**
 * Select due PENDING rows and PROCESSING rows with expired leases.
 * FOR UPDATE SKIP LOCKED lets multiple publisher instances claim separate rows.
 */
async function claimBatch(): Promise<ClaimedEvent[]> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS);

    return prisma.$transaction(async (tx) => {
        return tx.$queryRaw<ClaimedEvent[]>`
            WITH candidates AS (
                SELECT "id"
                FROM "CreditOutboxEvent"
                WHERE
                    (
                        "status" = 'PENDING'::"CreditOutboxEventStatus"
                        AND "nextAttemptAt" <= ${now}
                    )
                    OR (
                        "status" = 'PROCESSING'::"CreditOutboxEventStatus"
                        AND (
                            "lockedUntil" IS NULL
                            OR "lockedUntil" <= ${now}
                        )
                    )
                ORDER BY "createdAt" ASC, "id" ASC
                FOR UPDATE SKIP LOCKED
                LIMIT ${BATCH_SIZE}
            )
            UPDATE "CreditOutboxEvent" AS event
            SET
                "status" = 'PROCESSING'::"CreditOutboxEventStatus",
                "lockedUntil" = ${leaseUntil}
            FROM candidates
            WHERE event."id" = candidates."id"
            RETURNING
                event."id",
                event."eventType",
                event."payload",
                event."retryCount",
                event."lockedUntil"
        `;
    });
}

function serializePayload(payload: unknown, event: ClaimedEvent): Buffer {
    if (
        typeof payload !== "object" ||
        payload === null ||
        Array.isArray(payload)
    ) {
        throw new Error("INVALID_OUTBOX_PAYLOAD");
    }

    const record = payload as Record<string, unknown>;

    if (
        record.eventId !== event.id ||
        record.eventType !== event.eventType ||
        typeof record.correlationId !== "string" ||
        typeof record.orderId !== "string"
    ) {
        throw new Error("INVALID_OUTBOX_PAYLOAD");
    }

    if (
        event.eventType ===
        CreditOutboxEventType.CREDIT_RESERVATION_SUCCEEDED &&
        typeof record.reservationId !== "string"
    ) {
        throw new Error("INVALID_OUTBOX_PAYLOAD");
    }

    if (
        event.eventType === CreditOutboxEventType.CREDIT_RESERVATION_FAILED &&
        typeof record.reasonCode !== "string"
    ) {
        throw new Error("INVALID_OUTBOX_PAYLOAD");
    }

    return Buffer.from(JSON.stringify(record), "utf8");
}

// Random jitter reduces synchronized retries across publisher instances.
function backoffMs(retryCount: number): number {
    const exponential = Math.min(
        1_000 * 2 ** Math.max(0, retryCount - 1),
        MAX_BACKOFF_MS,
    );
    const jitter = Math.floor(Math.random() * 500);

    return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}

async function publishOne(
    event: ClaimedEvent,
    channel: Awaited<
        ReturnType<typeof connectReservationResultMessaging>
    >["channel"],
): Promise<void> {
    if (!isPublishableCreditReservationResultType(event.eventType)) {
        await prisma.creditOutboxEvent.updateMany({
            where: {
                id: event.id,
                status: CreditOutboxEventStatus.PROCESSING,
                lockedUntil: event.lockedUntil,
            },
            data: {
                status: CreditOutboxEventStatus.DEAD,
                lockedUntil: null,
                lastError: "UNSUPPORTED_EVENT_TYPE",
            },
        });
        return;
    }

    const routingKey = routingKeys[event.eventType];

    try {
        const content = serializePayload(event.payload, event);

        await publishConfirmed(
            channel,
            RESERVATION_RESULT_MESSAGING.exchange,
            routingKey,
            content,
            {
                messageId: event.id,
                correlationId: (event.payload as { correlationId: string })
                    .correlationId,
            },
        );

        await prisma.creditOutboxEvent.updateMany({
            where: {
                id: event.id,
                status: CreditOutboxEventStatus.PROCESSING,
                lockedUntil: event.lockedUntil,
            },
            data: {
                status: CreditOutboxEventStatus.PUBLISHED,
                publishedAt: new Date(),
                lockedUntil: null,
                lastError: null,
            },
        });

        logger.info({
            eventId: event.id,
            eventType: event.eventType,
        }, "Outbox event published successfully");
    } catch (error) {
        const nextRetryCount = event.retryCount + 1;
        const dead = nextRetryCount >= MAX_RETRIES;

        await prisma.creditOutboxEvent.updateMany({
            where: {
                id: event.id,
                status: CreditOutboxEventStatus.PROCESSING,
                lockedUntil: event.lockedUntil,
            },
            data: {
                status: dead
                    ? CreditOutboxEventStatus.DEAD
                    : CreditOutboxEventStatus.PENDING,
                retryCount: nextRetryCount,
                nextAttemptAt: new Date(
                    Date.now() + backoffMs(nextRetryCount),
                ),
                lockedUntil: null,
                lastError:
                    error instanceof Error
                        ? error.message.slice(0, 1_000)
                        : "UNKNOWN_PUBLISH_ERROR",
            },
        });

        logger.error({
            eventId: event.id,
            retryCount: nextRetryCount,
            dead,
        }, "Credit outbox publish failed");

        // publishConfirmed may have closed an unhealthy channel.
        // Reconnect before trying to publish another event.
        throw error;
    }
}

export function startCreditOutboxPublisher(): () => Promise<void> {
    const abortController = new AbortController();

    const run = async () => {
        let retry = 0;

        while (!abortController.signal.aborted) {
            let connection:
                | Awaited<
                    ReturnType<
                        typeof connectReservationResultMessaging
                    >
                >["connection"]
                | undefined;
            let channel:
                | Awaited<
                    ReturnType<
                        typeof connectReservationResultMessaging
                    >
                >["channel"]
                | undefined;

            try {
                const events = await claimBatch();

                if (events.length === 0) {
                    logger.debug("No outbox events to publish; waiting for next poll");
                    await delay(POLL_INTERVAL_MS, undefined, {
                        signal: abortController.signal,
                    });
                    continue;
                }

                // Connect only now that there is something to publish.
                const messaging = await connectReservationResultMessaging();
                connection = messaging.connection;
                channel = messaging.channel;
                retry = 0;

                // Use one in-flight publish per channel.
                for (const event of events) {
                    if (abortController.signal.aborted) break;
                    await publishOne(event, channel);
                }
            } catch (error) {
                if (!abortController.signal.aborted) {
                    retry++;

                    logger.error({
                        retry,
                        error:
                            error instanceof Error
                                ? error.message
                                : "UNKNOWN_ERROR",
                    }, "Credit outbox publisher iteration failed");

                    await delay(backoffMs(retry), undefined, {
                        signal: abortController.signal,
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