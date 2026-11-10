// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Synchronous reservation and abort input validation.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import { z } from "zod";

export const reservationIdSchema = z.uuid().transform(value => value.toLowerCase());
export const reservationSchema = z.strictObject({
    orderId: reservationIdSchema,
    requesterId: reservationIdSchema,
    amount: z.number().int().min(1).max(2_147_483_647),
});

export type ReservationInput = z.infer<typeof reservationSchema>;

export const abortReservationSchema = reservationSchema.extend({ reservationId: reservationIdSchema });
export type AbortReservationInput = z.infer<typeof abortReservationSchema>;
