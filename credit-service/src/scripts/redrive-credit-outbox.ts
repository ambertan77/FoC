// AI Assistance Disclosure:
// Tool: ChatGPT (5.6 Luna)
// Date: approx. 2026-10-30
// Scope: Generated the redrive scripts for failing RabbitMQ messages.
// Author review: Reviewed, tested, and edited by Ng See Pui.

import { CreditOutboxEventStatus, CreditOutboxEventType } from "../generated/prisma/client.js";
import { prisma } from "../libs/prisma.js";

const usage = "Usage: npm run redrive:credit-outbox -- --limit <positive integer>";

type DeadEventCandidate = {
    id: string;
    eventType: CreditOutboxEventType;
    payload: unknown;
};

function isValidPayload(event: DeadEventCandidate): boolean {
    if (
        typeof event.payload !== "object" ||
        event.payload === null ||
        Array.isArray(event.payload)
    ) {
        return false;
    }

    const payload = event.payload as Record<string, unknown>;

    if (
        payload.eventId !== event.id ||
        payload.eventType !== event.eventType ||
        typeof payload.correlationId !== "string" ||
        typeof payload.orderId !== "string"
    ) {
        return false;
    }

    if (
        event.eventType ===
        CreditOutboxEventType.CREDIT_RESERVATION_SUCCEEDED
    ) {
        return typeof payload.reservationId === "string";
    }

    if (
        event.eventType === CreditOutboxEventType.CREDIT_RESERVATION_FAILED
    ) {
        return typeof payload.reasonCode === "string";
    }

    return false;
}

async function redrive(limit: number): Promise<void> {
    try {
        const result = await prisma.$transaction(async (tx) => {
            const candidates: DeadEventCandidate[] =
                await tx.creditOutboxEvent.findMany({
                    where: { status: CreditOutboxEventStatus.DEAD },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                    take: limit,
                    select: {
                        id: true,
                        eventType: true,
                        payload: true,
                    },
                });

            const valid = candidates.filter(isValidPayload);
            const invalid = candidates.filter((event) => !isValidPayload(event));

            if (valid.length === 0) {
                return { resetCount: 0, invalidIds: invalid.map((event) => event.id) };
            }

            const updated = await tx.creditOutboxEvent.updateMany({
                where: {
                    id: { in: valid.map((event) => event.id) },
                    status: CreditOutboxEventStatus.DEAD,
                },
                data: {
                    status: CreditOutboxEventStatus.PENDING,
                    retryCount: 0,
                    nextAttemptAt: new Date(),
                    lockedUntil: null,
                    lastError: null,
                    publishedAt: null,
                },
            });

            return {
                resetCount: updated.count,
                invalidIds: invalid.map((event) => event.id),
            };
        });

        console.info("Credit outbox redrive", {
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
        // Avoid printing database details or connection information.
        console.error("Credit outbox redrive", {
            outcome: "stopped",
            reason: "DATABASE_OPERATION_FAILED",
        });
        process.exitCode = 1;
    }
}