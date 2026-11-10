// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Transfer, release and refund event validation.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import { z } from "zod";
import { reservationIdSchema } from "./reservation.schema.js";

const settlementBaseSchema = z.strictObject({
    eventId: reservationIdSchema,
    orderId: reservationIdSchema,
    reservationId: reservationIdSchema,
    requesterId: reservationIdSchema,
    amount: z.number().int().min(1).max(2_147_483_647),
});
export const receiptEventSchema = settlementBaseSchema.extend({
    eventType: z.literal("ORDER_RECEIVED"),
    courierId: reservationIdSchema,
});
export const releaseEventSchema = settlementBaseSchema.extend({
    eventType: z.enum(["ORDER_CANCELED", "ORDER_EXPIRED"]),
});
export const refundEventSchema = settlementBaseSchema.extend({
    eventType: z.literal("ORDER_FAILED"),
});
export const settlementEventSchema = z.discriminatedUnion("eventType", [receiptEventSchema, releaseEventSchema, refundEventSchema]);
export type SettlementEvent = z.infer<typeof settlementEventSchema>;
