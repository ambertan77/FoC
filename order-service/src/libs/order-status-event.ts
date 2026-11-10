import { randomUUID } from "node:crypto";
import {
    OrderEventType,
    type OrderStatus,
    type Prisma,
} from "../generated/prisma/client.js";

export interface StatusChangeOrder {
    id: string;
    name: string;
    requesterId: string;
    courierId: string | null;
    offeredCredits: number;
}

/**
 * Writes the ORDER_STATUS_CHANGED outbox row. Call it INSIDE the same transaction that
 * updates the order, right after the orderStatusHistory row, so the status change and
 * the notification event are saved (or rolled back) together.
 *
 * `version` is the order's version AFTER the update, so clients can ignore stale updates.
 * The payload shape must match notification-service's strict orderStatusEventSchema.
 */
export async function enqueueOrderStatusChanged(
    tx: Prisma.TransactionClient,
    args: {
        order: StatusChangeOrder;
        fromStatus: OrderStatus | null;
        toStatus: OrderStatus;
        version: number;
    },
): Promise<void> {
    const eventId = randomUUID();
    const { order } = args;

    await tx.outboxEvent.create({
        data: {
            id: eventId,
            orderId: order.id,
            eventType: OrderEventType.ORDER_STATUS_CHANGED,
            payload: {
                eventId,
                eventType: "ORDER_STATUS_CHANGED",
                orderId: order.id,
                orderName: order.name,
                requesterId: order.requesterId,
                courierId: order.courierId,
                fromStatus: args.fromStatus,
                toStatus: args.toStatus,
                version: args.version,
                offeredCredits: order.offeredCredits,
                occurredAt: new Date().toISOString(),
            },
        },
    });
}
