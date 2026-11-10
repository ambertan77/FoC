// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6),  Claude Code (Claude Sonnet 5.5)
// Date: approx. 2026-11-09
// Scope: Generated the backend notification service, including notification rules, event processing, persistence, unread counts, read-state updates, and SSE replay support.
// Author review: Reviewed, tested, and edited by Ng See Pui.

import { prisma } from "../libs/prisma.js";
import type { OrderStatusEvent } from "../schemas/order-status-event.schema.js";
import { draftsFor } from "./notification-rules.js";
import { hub, type PushPayload } from "../sse/hub.js";

function toPayload(n: {
    seq: number;
    id: string;
    orderId: string;
    type: string;
    title: string;
    body: string;
    data: unknown;
    createdAt: Date;
}): PushPayload {
    return {
        seq: n.seq,
        id: n.id,
        orderId: n.orderId,
        type: n.type,
        title: n.title,
        body: n.body,
        data: n.data,
        createdAt: n.createdAt,
    };
}

/**
 * Stores one notification per recipient and pushes them to open streams.
 * Idempotent: the inbox row and the (userId, eventId) unique key make a
 * redelivered event a no-op. The push happens after commit and is best-effort;
 * the stored row is what guarantees the user sees it on their next fetch.
 */
export async function handleOrderStatusEvent(event: OrderStatusEvent): Promise<number> {
    const drafts = draftsFor(event);

    const created = await prisma.$transaction(async (tx) => {
        const seen = await tx.processedEvent.createMany({
            data: [{ eventId: event.eventId }],
            skipDuplicates: true,
        });
        if (seen.count === 0) return []; // duplicate delivery

        if (drafts.length === 0) return [];

        return tx.notification.createManyAndReturn({
            data: drafts.map((d) => ({
                userId: d.userId,
                orderId: event.orderId,
                eventId: event.eventId,
                type: event.toStatus,
                title: d.title,
                body: d.body,
                data: {
                    orderId: event.orderId,
                    fromStatus: event.fromStatus,
                    toStatus: event.toStatus,
                    version: event.version,
                    occurredAt: event.occurredAt,
                },
            })),
            skipDuplicates: true,
        });
    });

    for (const n of created) hub.push(n.userId, toPayload(n));
    return created.length;
}

export async function listNotifications(
    userId: string,
    opts: { unreadOnly: boolean; limit: number; beforeSeq: number | undefined },
) {
    const rows = await prisma.notification.findMany({
        where: {
            userId,
            ...(opts.unreadOnly ? { readAt: null } : {}),
            ...(opts.beforeSeq ? { seq: { lt: opts.beforeSeq } } : {}),
        },
        orderBy: { seq: "desc" },
        take: opts.limit + 1,
    });
    const hasMore = rows.length > opts.limit;
    const items = hasMore ? rows.slice(0, opts.limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.seq : null };
}

export function countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, id: string) {
    const res = await prisma.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: new Date() },
    });
    return res.count;
}

export async function markAllRead(userId: string) {
    const res = await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
    });
    return res.count;
}

/** Notifications the client missed while disconnected (SSE Last-Event-ID replay). */
export function missedSince(userId: string, afterSeq: number) {
    return prisma.notification.findMany({
        where: { userId, seq: { gt: afterSeq } },
        orderBy: { seq: "asc" },
        take: 200,
    });
}

export { toPayload };
