// AI Assistance Disclosure:
// Tool: Claude Code (Opus 5.5)
// Date: 2026-11-06
// Scope: Added line 99 to fix an issue regarding credits not getting transferred when an order is reflected as AUTO_RECEIVED.
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import { AppError } from "../errors/errors.js";
import { prisma } from "../libs/prisma.js";
import { OrderEventType, OrderStatus } from "../generated/prisma/client.js";
import { randomUUID } from "node:crypto";

/* 
Each requester is given 30 minutes to mark a COMPLETED order as RECEIVED OR FAILED. After 30 minutes, if the 
requester has yet to update order status, the OrderReceiptWorker will update the order to RECEIVED automatically.

This ensures that: (1) all orders will eventually reach the end of their lifecycle, and (2) credits will not
get stuck in the reserve wallet. 
*/ 

export async function updateOrdersAsReceived(): Promise<number> {
    const thirtyMinutesEarlier: Date = new Date(); // current time
    thirtyMinutesEarlier.setMinutes(thirtyMinutesEarlier.getMinutes() - 30); // 30 minutes before current time

    // find all the orders in the COMPLETED stage that were completed more than 30 minutes ago
    const candidateOrders = await prisma.order.findMany({
        where: {
            status: OrderStatus.COMPLETED,
            completedAt: {
                lte: thirtyMinutesEarlier, // currently past completion time + 30 minutes
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

    let updatedOrdersCount: number = 0; // track the number of orders we update to RECEIVED

    for (const order of candidateOrders) {
        // throw error if the current order has no credit reservation
        if (!order.creditReservationId) {
            throw new AppError(
                `Expired order ${order.id} has no credit reservation`,
                409,
            );
        }

        const eventId = randomUUID();
        const result = await prisma.$transaction(async (tx) => {
            const updated = await tx.order.updateMany({
                where: {
                    id: order.id,
                    status: OrderStatus.COMPLETED,
                    version: order.version, // ensure the fetched order's version is still the same
                    completedAt: {
                        lte: thirtyMinutesEarlier, // currently past completion time + 30 minutes
                    }
                },
                data: {
                    status: OrderStatus.AUTO_RECEIVED,
                    version: { increment: 1 },
                    receivedAt: new Date(), // current time
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
                    toStatus: OrderStatus.AUTO_RECEIVED,
                    changedBy: null, // indicate system update with null
                    reason: "Requester did not receive the order before timeout, thus an automatic system update was applied.",
                }
            });

            await tx.outboxEvent.create({
                data: {
                    id: eventId,
                    orderId: order.id,
                    eventType: OrderEventType.ORDER_RECEIVED,
                    payload: {
                        eventId: eventId,
                        eventType: OrderEventType.ORDER_RECEIVED,
                        reservationId: order.creditReservationId,
                        orderId: order.id,
                        requesterId: order.requesterId,
                        courierId: order.courierId, // this line was suggested by AI then personally added by Amber Tan Junning.
                        amount: order.offeredCredits,
                    }
                }
            });

            return true; // all messages and updates to databases have been published successfully

        });

        if (result) {
            updatedOrdersCount++;
        }
    }

    return updatedOrdersCount;
}
