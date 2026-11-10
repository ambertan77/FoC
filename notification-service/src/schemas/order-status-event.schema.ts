// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6),  Claude Code (Claude Sonnet 5.5)
// Date: approx. 2026-11-09
// Scope: Generated the backend notification service, including notification rules, event processing, persistence, unread counts, read-state updates, and SSE replay support.
// Author review: Reviewed, tested, and edited by Ng See Pui.

import { z } from "zod";

export const ORDER_STATUSES = [
    "OPEN",
    "ACCEPTED",
    "PICKED_UP",
    "COMPLETED",
    "RECEIVED",
    "CANCELED",
    "EXPIRED",
    "FAILED",
    "AUTO_FAILED",
    "PENDING_RESERVATION",
    "RESERVATION_FAILED",
    "AUTO_RECEIVED",
] as const;

export const orderStatusEventSchema = z
    .object({
        eventId: z.uuid().transform((v) => v.toLowerCase()),
        eventType: z.literal("ORDER_STATUS_CHANGED"),
        orderId: z.uuid().transform((v) => v.toLowerCase()),
        orderName: z.string().min(1).max(255),
        requesterId: z.uuid().transform((v) => v.toLowerCase()),
        courierId: z.uuid().transform((v) => v.toLowerCase()).nullable(),
        fromStatus: z.enum(ORDER_STATUSES).nullable(),
        toStatus: z.enum(ORDER_STATUSES),
        version: z.number().int().positive(),
        offeredCredits: z.number().int().nonnegative().optional(),
        occurredAt: z.iso.datetime(),
    })
    .strict();

export type OrderStatusEvent = z.infer<typeof orderStatusEventSchema>;
