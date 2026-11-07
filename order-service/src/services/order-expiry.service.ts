import { AppError } from "../errors/errors.js";
import { prisma } from "../libs/prisma.js";
import { OrderEventType, OrderStatus } from "../generated/prisma/client.js";
import { randomUUID } from "node:crypto";

/* 
expiryAt is the deadline for the order to be completed by the courier.
1. If the order is not accepted by a courier before the expiryAt timestamp, 
the order will be marked as expired and the credits will be released back to the requester. 
The requester can renew the order by setting a new expiryAt timestamp, and the order will be re-opened for couriers to accept.

2. If the order is accepted by a courier but not completed before the expiryAt timestamp,
the order will be marked as failed and the credits will be released back to the requester. 
*/

const COMPLETION_FAILURE_REASON = "The courier did not complete the delivery before the request completion deadline.";

const OPEN_EXPIRY_REASON = "No courier accepted the request before its completion deadline.";

export async function updateExpiredOrders(): Promise<number> {
    const now: Date = new Date();
    console.log(`Checking for expired orders at ${now.toISOString()}`);

    const candidateOrders = await prisma.order.findMany({
        where: {
            status: {
                in: [
                    OrderStatus.OPEN,
                    OrderStatus.PICKED_UP,
                    OrderStatus.ACCEPTED,
                ]
            },
            expiryAt: {
                lte: now, // currently past the expired time (expiry time <= current time), need to update
            }
        },
        select: {
            id: true,
            requesterId: true,
            courierId: true,
            status: true,
            version: true,
            offeredCredits: true,
            creditReservationId: true,
        }
    });

    let expiredOrdersCount = 0;

    for (const order of candidateOrders) {
        const expiredBeforeAcceptance = order.status === OrderStatus.OPEN && (!order.courierId || order.courierId === null);
        const nextStatus = expiredBeforeAcceptance ? OrderStatus.EXPIRED : OrderStatus.AUTO_FAILED;
        const eventType = expiredBeforeAcceptance ? OrderEventType.ORDER_EXPIRED : OrderEventType.ORDER_FAILED;
        const reason = expiredBeforeAcceptance ? OPEN_EXPIRY_REASON : COMPLETION_FAILURE_REASON;

        if (!order.creditReservationId) {
            console.error(`Expired order ${order.id} has no credit reservation; skipping`);
            continue;
        }

        const eventId = randomUUID();
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.order.updateMany({
                where: {
                    id: order.id,
                    status: order.status,
                    version: order.version,
                    expiryAt: {
                        lte: now,
                    }
                },
                data: {
                    status: nextStatus,
                    version: { increment: 1 },
                    ...(expiredBeforeAcceptance
                        ? { expiredAt: now }
                        : { failedAt: now, failureReason: reason }),
                }
            });

            // Another request changed the order after it was fetched, 
            // so we skip this order and move on to the next one.
            if (updated.count !== 1) {
                return false;
            }

            await tx.orderStatusHistory.create({
                data: {
                    orderId: order.id,
                    fromStatus: order.status,
                    toStatus: nextStatus,
                    changedBy: null, // indicate system update with null
                    reason: reason,
                }
            });

            await tx.outboxEvent.create({
                data: {
                    id: eventId,
                    orderId: order.id,
                    eventType: eventType,
                    payload: {
                        eventId: eventId,
                        eventType: eventType,
                        reservationId: order.creditReservationId,
                        orderId: order.id,
                        requesterId: order.requesterId,
                        amount: order.offeredCredits,
                    }
                }
            });

            return true;

        });

        if (result) {
            expiredOrdersCount++;
        }
    }

    return expiredOrdersCount;
}
