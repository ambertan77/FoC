import { isDeepStrictEqual } from "node:util";
import {
    CreditReservationResultType,
    OrderEventType,
    OrderStatus,
    Prisma,
} from "../generated/prisma/client.js";
import { AppError } from "../errors/errors.js";
import { prisma } from "../libs/prisma.js";
import { reservationRequestPayloadSchema, type CreateRequestPayload, type CreditReservationResult, type RenewRequestPayload } from "../schemas/credit-reservation-result.schema.js";
import { enqueueOrderStatusChanged } from "../libs/order-status-event.js";

function assertSameReplay(
    stored: {
        correlationId: string;
        eventType: CreditReservationResultType;
        payload: Prisma.JsonValue;
    },
    incoming: CreditReservationResult,
): void {
    if (
        stored.correlationId !== incoming.correlationId ||
        stored.eventType !== incoming.eventType ||
        !isDeepStrictEqual(stored.payload, incoming)
    ) {
        throw new AppError(
            "Credit result event ID was reused with different data",
            409,
        );
    }
}

async function applyCreateResult(
    tx: Prisma.TransactionClient,
    payload: CreateRequestPayload,
    event: CreditReservationResult,
): Promise<void> {
    const order = await tx.order.findUnique({
        where: { id: payload.orderId },
    });

    if (!order) {
        throw new AppError("Order for credit result was not found", 404);
    }

    if (order.status !== OrderStatus.PENDING_RESERVATION) {
        throw new AppError(
            "Order is no longer awaiting credit reservation",
            409,
        );
    }

    const succeeded =
        event.eventType === "CREDIT_RESERVATION_SUCCEEDED";
    const nextStatus = succeeded
        ? OrderStatus.OPEN
        : OrderStatus.RESERVATION_FAILED;

    const updated = await tx.order.updateMany({
        where: {
            id: order.id,
            status: OrderStatus.PENDING_RESERVATION,
        },
        data: {
            status: nextStatus,
            version: { increment: 1 },
            ...(succeeded
                ? { creditReservationId: event.reservationId }
                : { reservationFailureCode: event.reasonCode }),
        },
    });

    if (updated.count !== 1) {
        throw new AppError("Order changed while applying credit result", 409);
    }

    await tx.orderStatusHistory.create({
        data: {
            orderId: order.id,
            fromStatus: OrderStatus.PENDING_RESERVATION,
            toStatus: nextStatus,
            changedBy: null,
            reason: succeeded ? null : event.reasonCode,
        },
    });

    await enqueueOrderStatusChanged(tx, {
        order,
        fromStatus: OrderStatus.PENDING_RESERVATION,
        toStatus: nextStatus,
        version: order.version + 1,
    });
}

async function applyRenewResult(
    tx: Prisma.TransactionClient,
    payload: RenewRequestPayload,
    event: CreditReservationResult,
): Promise<void> {
    const order = await tx.order.findUnique({
        where: { id: payload.orderId },
    });

    if (!order) {
        throw new AppError("Order for renewal result was not found", 404);
    }

    const renewalStillApplies =
        order.status === OrderStatus.EXPIRED &&
        order.renewalPending &&
        order.version === payload.expectedVersion &&
        order.creditReservationId === payload.previousReservationId;

    if (!renewalStillApplies) {
        throw new AppError(
            "Order changed while its renewal was processing",
            409,
        );
    }

    const succeeded =
        event.eventType === "CREDIT_RESERVATION_SUCCEEDED";

    const updated = await tx.order.updateMany({
        where: {
            id: order.id,
            status: OrderStatus.EXPIRED,
            renewalPending: true,
            version: payload.expectedVersion,
            creditReservationId: payload.previousReservationId,
        },
        data: succeeded
            ? {
                status: OrderStatus.OPEN,
                expiryAt: new Date(payload.expiryAt),
                expiredAt: null,
                creditReservationId: event.reservationId,
                renewalPending: false,
                renewalFailureCode: null,
                version: { increment: 1 },
            }
            : {
                // Failed renewal leaves the order expired with its old
                // reservation ID. It can be renewed again later.
                renewalPending: false,
                renewalFailureCode: event.reasonCode,
                version: { increment: 1 },
            },
    });

    if (updated.count !== 1) {
        throw new AppError(
            "Order changed while applying renewal result",
            409,
        );
    }

    if (succeeded) {
        await tx.orderStatusHistory.create({
            data: {
                orderId: order.id,
                fromStatus: OrderStatus.EXPIRED,
                toStatus: OrderStatus.OPEN,
                changedBy: null,
                reason: "Request renewed",
            },
        });

        await enqueueOrderStatusChanged(tx, {
            order,
            fromStatus: OrderStatus.EXPIRED,
            toStatus: OrderStatus.OPEN,
            version: order.version + 1,
        });
    }
}

function creditResultType(
    event: CreditReservationResult,
): CreditReservationResultType {
    return event.eventType === "CREDIT_RESERVATION_SUCCEEDED"
        ? CreditReservationResultType.CREDIT_RESERVATION_SUCCEEDED
        : CreditReservationResultType.CREDIT_RESERVATION_FAILED;
}

export async function creditReservationResultService(
    event: CreditReservationResult,
): Promise<void> {
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Check if this event has already been processed (idempotency)
            const replay = await tx.creditReservationResultInbox.findUnique({
                where: { eventId: event.eventId },
            });

            // 2. If it has, ensure the replayed event matches the incoming event
            if (replay) {
                assertSameReplay(replay, event);
                return;
            }

            // 3. Find the original reservation request event that this result corresponds to
            const requestEvent = await tx.outboxEvent.findUnique({
                where: { id: event.correlationId },
                select: {
                    orderId: true,
                    eventType: true,
                    payload: true,
                },
            });

            // 4. Validate that the request event exists and matches the incoming result
            if (
                !requestEvent ||
                requestEvent.orderId !== event.orderId ||
                requestEvent.eventType !==
                OrderEventType.RESERVE_CREDITS
            ) {
                throw new AppError(
                    "Credit result does not match a reservation request",
                    409,
                );
            }

            // 5. Validate that the request payload matches the incoming result
            const parsedRequest =
                reservationRequestPayloadSchema.safeParse(
                    requestEvent.payload,
                );

            if (
                !parsedRequest.success ||
                parsedRequest.data.eventId !== event.correlationId ||
                parsedRequest.data.orderId !== event.orderId ||
                parsedRequest.data.requestType !== event.requestType
            ) {
                throw new AppError(
                    "Credit result does not match the original request payload",
                    409,
                );
            }

            // 6. Apply the result to the order based on the request type (CREATE or RENEW)
            if (parsedRequest.data.requestType === "CREATE") {
                await applyCreateResult(tx, parsedRequest.data, event);
            } else {
                await applyRenewResult(tx, parsedRequest.data, event);
            }

            // 7. Record the processed result in the inbox for idempotency
            await tx.creditReservationResultInbox.create({
                data: {
                    eventId: event.eventId,
                    correlationId: event.correlationId,
                    eventType: creditResultType(event),
                    payload: event as Prisma.InputJsonValue,
                },
            });
        });
    } catch (error) {
        // A concurrent duplicate may hit the inbox unique constraint.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const replay =
                await prisma.creditReservationResultInbox.findUnique({
                    where: { eventId: event.eventId },
                });

            if (replay) {
                assertSameReplay(replay, event);
                return;
            }
        }

        throw error;
    }
}