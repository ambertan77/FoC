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
