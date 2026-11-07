import { z } from "zod";
import { reservationIdSchema } from "./reservation.schema.js";

const reservationRequestFields = {
    eventId: reservationIdSchema,
    eventType: z.literal("RESERVE_CREDITS"),
    orderId: reservationIdSchema,
    requesterId: reservationIdSchema,
    amount: z.number().int().min(1).max(2_147_483_647),
};

export const reservationRequestEventSchema = z.discriminatedUnion(
    "requestType",
    [
        z.strictObject({
            ...reservationRequestFields,
            requestType: z.literal("CREATE"),
        }),
        z.strictObject({
            ...reservationRequestFields,
            requestType: z.literal("RENEW"),
            previousReservationId: reservationIdSchema,
            expectedVersion: z.number().int().positive(),
            expiryAt: z.iso.datetime(),
        }),
    ],
);

export type ReservationRequestEvent = z.infer<typeof reservationRequestEventSchema>;