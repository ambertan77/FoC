// AI Assistance Disclosure:
// Tool: ChatGPT (5.6 Luna)
// Date: approx. 2026-10-30
// Scope: Generated the redrive scripts for failing RabbitMQ messages.
// Author review: Reviewed, tested, and edited by Ng See Pui.

import { prisma } from "../libs/prisma.js";

const SUPPORTED_EVENT_TYPES = new Set([
    "RESERVE_CREDITS",
    "ORDER_RECEIVED",
    "ORDER_CANCELED",
    "ORDER_EXPIRED",
    "ORDER_FAILED",
    "ORDER_STATUS_CHANGED",
]);

const usage = "Usage: npm run redrive:order-outbox -- --limit <positive integer>";

function hasValidEnvelope(event: {
    id: string;
    eventType: string;
    payload: unknown;
}): boolean {
    if (
        typeof event.payload !== "object" ||
        event.payload === null ||
        Array.isArray(event.payload)
    ) {
        return false;
    }

    const payload = event.payload as Record<string, unknown>;

    return (
        SUPPORTED_EVENT_TYPES.has(event.eventType) &&
        payload.eventId === event.id &&
        payload.eventType === event.eventType
    );
}

async function redrive(limit: number): Promise<void> {
    try {
        const result = await prisma.$transaction(async (tx) => {
            const candidates = await tx.outboxEvent.findMany({
                where: { status: "DEAD" },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: limit,
                select: {
                    id: true,
                    eventType: true,
                    payload: true,
                },
            });

            const valid = candidates.filter(hasValidEnvelope);
            const invalidIds = candidates
                .filter((event) => !hasValidEnvelope(event))
                .map((event) => event.id);

            if (valid.length === 0) {
                return { resetCount: 0, invalidIds };
            }

            const updated = await tx.outboxEvent.updateMany({
                where: {
                    id: { in: valid.map((event) => event.id) },
                    status: "DEAD",
                },
                data: {
                    status: "PENDING",
                    retryCount: 0,
                    nextAttemptAt: new Date(),
                    lockedUntil: null,
                    lastError: null,
                    publishedAt: null,
                },
            });

            return { resetCount: updated.count, invalidIds };
        });

        console.info("Order outbox redrive", {
            outcome: "complete",
            resetCount: result.resetCount,
            invalidCount: result.invalidIds.length,
            invalidIds: result.invalidIds,
        });
    } finally {
        await prisma.$disconnect();
    }
}

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === "--help") {
    console.info(usage);
} else if (
    args.length !== 2 ||
    args[0] !== "--limit" ||
    !/^[1-9]\d*$/.test(args[1] ?? "") ||
    !Number.isSafeInteger(Number(args[1]))
) {
    console.error(usage);
    process.exitCode = 1;
} else {
    try {
        await redrive(Number(args[1]));
    } catch {
        console.error("Order outbox redrive", {
            outcome: "stopped",
            reason: "DATABASE_OPERATION_FAILED",
        });
        process.exitCode = 1;
    }
}