import { z } from "zod";

const uuid = z.uuid().transform((value) => value.toLowerCase());

const baseResultSchema = z.object({
    eventId: uuid,
    correlationId: uuid,
    requestType: z.enum(["CREATE", "RENEW"]),
    orderId: uuid,
});

export const creditReservationSucceededSchema = baseResultSchema.extend({
    eventType: z.literal("CREDIT_RESERVATION_SUCCEEDED"),
    reservationId: uuid,
});

export const creditReservationFailedSchema = baseResultSchema.extend({
    eventType: z.literal("CREDIT_RESERVATION_FAILED"),
    reasonCode: z.string().trim().min(1).max(255),
});

export const creditReservationResultSchema = z.discriminatedUnion("eventType", [
    creditReservationSucceededSchema,
    creditReservationFailedSchema,
]);

export type CreditReservationResult = z.infer<typeof creditReservationResultSchema>;


const createRequestPayloadSchema = z.strictObject({
    eventId: uuid,
    eventType: z.literal("RESERVE_CREDITS"),
    requestType: z.literal("CREATE"),
    orderId: uuid,
    requesterId: uuid,
    amount: z.number().int().positive(),
});

const renewRequestPayloadSchema = z.strictObject({
    eventId: uuid,
    eventType: z.literal("RESERVE_CREDITS"),
    requestType: z.literal("RENEW"),
    orderId: uuid,
    requesterId: uuid,
    amount: z.number().int().positive(),
    previousReservationId: uuid,
    expectedVersion: z.number().int().positive(),
    expiryAt: z.iso.datetime(),
});

export const reservationRequestPayloadSchema = z.discriminatedUnion("requestType", [
    createRequestPayloadSchema,
    renewRequestPayloadSchema,
]);

export type CreateRequestPayload = z.infer<typeof createRequestPayloadSchema>;
export type RenewRequestPayload = z.infer<typeof renewRequestPayloadSchema>;
export type ReservationRequestPayload = z.infer<typeof reservationRequestPayloadSchema>;