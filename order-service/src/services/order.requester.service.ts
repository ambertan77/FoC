import { randomUUID } from "node:crypto";
import { AppError } from "../errors/errors.js";
import { OrderEventType, OrderStatus, Prisma } from "../generated/prisma/client.js";
import { verifySupplierExists } from "../integrations/supplier/supplier.client.js";
import { prisma } from "../libs/prisma.js";
import type { CancelRequestInput, CreateRequestInput, FailRequestInput, ReceiveRequestInput, RenewExpiredRequestInput, RequesterOrderHistoryQuery, UpdateRequestInput } from "../schemas/order.requester.schema.js";
import { enqueueOrderStatusChanged } from "../libs/order-status-event.js";
import { logger } from "../libs/logger.js";

export async function getRequesterOrderHistoryService(
    requesterId: string,
    query: RequesterOrderHistoryQuery
) {
    const { page, limit, status, sortBy, sortOrder } = query;
    const where = {
        requesterId: requesterId,
        ...(status ? { status: status } : {}), // If status is provided, include it in the where clause; otherwise, don't filter by status
    };

    const [orders, totalCount] = await Promise.all([
        prisma.order.findMany({
            where,
            orderBy: {
                [sortBy]: sortOrder,
            },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.order.count({ where }),
    ]);

    return {
        orders,
        pagination: {
            page,
            limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
        },
    };
};

export async function updateRequestService(
    requesterId: string,
    orderId: string,
    input: UpdateRequestInput,
) {
    const now = new Date();
    const { expectedVersion, ...changes } = input;

    const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
    });

    if (!existingOrder || existingOrder.requesterId !== requesterId) {
        throw new AppError("Order not found", 404);
    }

    // Ensure the order is not expired before allowing it to be updated
    if (existingOrder.expiryAt <= now) {
        throw new AppError("Cannot update an expired order", 409);
    }

    // Ensure the version matches the current version for optimistic concurrency control
    if (existingOrder.version !== expectedVersion) {
        throw new AppError("The request changed while you were editing it. Reload and try again.", 409);
    }

    // Compare the final pair, including whichever location wasn't changed.
    const pickupSupplierId =
        changes.pickupSupplierId ?? existingOrder.pickupSupplierId;
    const deliverySupplierId =
        changes.deliverySupplierId ?? existingOrder.deliverySupplierId;

    if (pickupSupplierId === deliverySupplierId) {
        throw new AppError(
            "Pickup and delivery locations must be different",
            400,
        );
    }

    // Ensure the order is in OPEN status and has no courier assigned before allowing it to be updated
    if (existingOrder.status !== OrderStatus.OPEN || existingOrder.courierId !== null) {
        throw new AppError(
            "This request has already been accepted and cannot be updated",
            409);
    }

    if (changes.expiryAt && changes.expiryAt <= now) {
        throw new AppError("Completion deadline must be in the future", 400);
    }

    if (changes.pickupSupplierId) {
        const pickupSupplierExists = await verifySupplierExists(changes.pickupSupplierId);

        if (!pickupSupplierExists) {
            throw new AppError("Pickup supplier does not exist", 400);
        }
    }

    if (changes.deliverySupplierId) {
        const deliverySupplierExists = await verifySupplierExists(changes.deliverySupplierId);
        if (!deliverySupplierExists) {
            throw new AppError("Delivery supplier does not exist", 400);
        }
    }

    // Prepare the data to update, only including fields that are provided in the input
    const dataToUpdate = {
        ...(changes.name !== undefined && { name: changes.name }),
        ...(changes.description !== undefined && { description: changes.description }),
        ...(changes.pickupSupplierId !== undefined && { pickupSupplierId: changes.pickupSupplierId }),
        ...(changes.deliverySupplierId !== undefined && { deliverySupplierId: changes.deliverySupplierId }),
        ...(changes.remarks !== undefined && { remarks: changes.remarks }),
        ...(changes.expiryAt !== undefined && { expiryAt: changes.expiryAt }),
    };

    return await prisma.$transaction(async (tx) => {
        // This ensure that there is no race condition when updating the order,
        // e.g. A courier accepts the order while the requester is updating it.
        const updatedOrder = await tx.order.updateMany({
            where: {
                id: orderId,
                requesterId: requesterId,
                status: OrderStatus.OPEN,
                courierId: null,
                version: expectedVersion,
            },
            data: {
                ...dataToUpdate,
                version: { increment: 1 }, // Increment the version 
            },
        });

        if (updatedOrder.count !== 1) {
            throw new AppError("The request changed while you were updating it. Reload and try again.", 409);
        }

        // Return the updated order
        return tx.order.findFirstOrThrow({
            where: { id: orderId },
        });
    });
};

export async function createRequestService(
    requesterId: string,
    input: CreateRequestInput,
) {
    // 1. Validate the completion deadline is in the future
    if (input.expiryAt <= new Date()) {
        throw new AppError("Completion deadline must be in the future", 400);
    }

    // 2. Verify that the pickup and delivery suppliers exist
    const [pickupSupplierExists, deliverySupplierExists] = await Promise.all([
        verifySupplierExists(input.pickupSupplierId),
        verifySupplierExists(input.deliverySupplierId)
    ]);

    if (!pickupSupplierExists) {
        logger.warn({ supplierId: input.pickupSupplierId }, "Pickup supplier does not exist");
        throw new AppError("Pickup supplier does not exist", 404);
    }

    if (!deliverySupplierExists) {
        logger.warn({ supplierId: input.deliverySupplierId }, "Delivery supplier does not exist");
        throw new AppError("Delivery supplier does not exist", 404);
    }

    // 3. Generate a new order ID and event ID for the outbox event
    const orderId = crypto.randomUUID();
    const eventId = randomUUID();

    // 4. Create the order request + history + outbox entries atomically in a transaction
    return prisma.$transaction(async (tx) => {
        const createOrder = await tx.order.create({
            data: {
                id: orderId,
                requesterId: requesterId,
                courierId: null,
                name: input.name,
                description: input.description,
                pickupSupplierId: input.pickupSupplierId,
                deliverySupplierId: input.deliverySupplierId,
                offeredCredits: input.offeredCredits,
                remarks: input.remarks ?? null,
                expiryAt: input.expiryAt,
                status: OrderStatus.PENDING_RESERVATION,
                version: 1,
                creditReservationId: null,
            },
        });

        await tx.orderStatusHistory.create({
            data: {
                orderId: createOrder.id,
                fromStatus: null,
                toStatus: OrderStatus.PENDING_RESERVATION,
                changedBy: requesterId,
                reason: "Waiting for credit reservation to be confirmed",
            },
        });

        await tx.outboxEvent.create({
            data: {
                id: eventId,
                orderId: createOrder.id,
                eventType: OrderEventType.RESERVE_CREDITS,
                payload: {
                    eventId: eventId,
                    eventType: OrderEventType.RESERVE_CREDITS,
                    requestType: "CREATE",
                    orderId: createOrder.id,
                    requesterId: requesterId,
                    amount: input.offeredCredits,
                } as Prisma.InputJsonValue,
            },
        });

        return createOrder;
    });
};

export async function receiveRequestService(
    requesterId: string,
    orderId: string,
    input: ReceiveRequestInput,
) {
    const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
    });

    // Ensure the order exists and belongs to the requester
    if (!existingOrder || existingOrder.requesterId !== requesterId) {
        throw new AppError("Order not found", 404);
    }

    // Ensure the order is in COMPLETED status and has a courier assigned before allowing it to be marked as received
    if (existingOrder.status !== OrderStatus.COMPLETED || !existingOrder.courierId) {
        throw new AppError(
            "The courier must complete the request before you can mark it as received",
            409,
        );
    }

    // Ensure the order has a credit reservation before allowing it to be marked as received
    if (!existingOrder.creditReservationId) {
        throw new AppError(
            "This request has no credit reservation to transfer to the courier",
            409,
        );
    }

    // Ensure the version matches the current version for optimistic concurrency control
    if (existingOrder.version !== input.expectedVersion) {
        throw new AppError("The request changed while being marked as received. Reload and try again.", 409);
    }

    const eventId = randomUUID();
    const receivedAt = new Date();

    const eventPayload = {
        eventId: eventId,
        eventType: OrderEventType.ORDER_RECEIVED,
        reservationId: existingOrder.creditReservationId,
        orderId: existingOrder.id,
        requesterId: existingOrder.requesterId,
        courierId: existingOrder.courierId,
        amount: existingOrder.offeredCredits,
    };

    return await prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.order.updateMany({
            where: {
                id: orderId,
                requesterId: requesterId,
                status: OrderStatus.COMPLETED,
                courierId: existingOrder.courierId,
                version: input.expectedVersion,
            },
            data: {
                status: OrderStatus.RECEIVED,
                receivedAt: receivedAt,
                version: { increment: 1 },
            },
        });

        if (updatedOrder.count !== 1) {
            throw new AppError("The request changed while being marked as received. Reload and try again.", 409);
        }

        await tx.orderStatusHistory.create({
            data: {
                orderId: orderId,
                fromStatus: OrderStatus.COMPLETED,
                toStatus: OrderStatus.RECEIVED,
                changedBy: requesterId,
                reason: null
            },
        });

        await tx.outboxEvent.create({
            data: {
                id: eventId,
                orderId: orderId,
                eventType: OrderEventType.ORDER_RECEIVED,
                payload: eventPayload,
            },
        });

        await enqueueOrderStatusChanged(tx, {
            order: existingOrder,
            fromStatus: OrderStatus.COMPLETED,
            toStatus: OrderStatus.RECEIVED,
            version: input.expectedVersion + 1,
        });

        return tx.order.findUniqueOrThrow({
            where: { id: orderId },
        });
    });
};

export async function failRequestService(
    requesterId: string,
    orderId: string,
    input: FailRequestInput,
) {
    const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
    });

    // Ensure the order exists and belongs to the requester
    if (!existingOrder || existingOrder.requesterId !== requesterId) {
        throw new AppError("Order not found", 404);
    }

    // Ensure the order is in COMPLETED status and has a courier assigned before allowing it to be marked as failed
    if (existingOrder.status !== OrderStatus.COMPLETED || !existingOrder.courierId) {
        throw new AppError(
            "The courier must complete the request before you can mark it as failed",
            409,
        );
    }

    // Ensure the order has a credit reservation before allowing it to be marked as failed
    if (!existingOrder.creditReservationId) {
        throw new AppError("This order does not have a credit reservation to refund", 409);
    }

    // Ensure the version matches the current version for optimistic concurrency control
    if (existingOrder.version !== input.expectedVersion) {
        throw new AppError("The request changed while being marked as failed. Reload and try again.", 409);
    }

    const eventId = randomUUID();
    const failedAt = new Date();

    const eventPayload = {
        eventId: eventId,
        eventType: OrderEventType.ORDER_FAILED,
        reservationId: existingOrder.creditReservationId,
        orderId: existingOrder.id,
        requesterId: existingOrder.requesterId,
        amount: existingOrder.offeredCredits,
    };

    return prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.order.updateMany({
            where: {
                id: orderId,
                requesterId: requesterId,
                status: OrderStatus.COMPLETED,
                courierId: existingOrder.courierId,
                version: input.expectedVersion,
            },
            data: {
                status: OrderStatus.FAILED,
                failedAt: failedAt,
                failureReason: input.failureReason,
                version: { increment: 1 },
            },
        });

        if (updatedOrder.count !== 1) {
            throw new AppError("The request changed while being marked as failed. Reload and try again.", 409);
        }

        await tx.orderStatusHistory.create({
            data: {
                orderId: orderId,
                fromStatus: OrderStatus.COMPLETED,
                toStatus: OrderStatus.FAILED,
                changedBy: requesterId,
                reason: input.failureReason
            },
        });

        await tx.outboxEvent.create({
            data: {
                id: eventId,
                orderId: orderId,
                eventType: OrderEventType.ORDER_FAILED,
                payload: eventPayload,
            },
        });

        await enqueueOrderStatusChanged(tx, {
            order: existingOrder,
            fromStatus: OrderStatus.COMPLETED,
            toStatus: OrderStatus.FAILED,
            version: input.expectedVersion + 1,
        });

        return tx.order.findUniqueOrThrow({
            where: { id: orderId },
        });
    });
};

export async function cancelRequestService(
    requesterId: string,
    orderId: string,
    input: CancelRequestInput,
) {
    const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
    });

    // Ensure the order exists and belongs to the requester
    if (!existingOrder || existingOrder.requesterId !== requesterId) {
        throw new AppError("Order not found", 404);
    }

    // Ensure the order is in OPEN status and has no courier assigned before allowing it to be canceled
    if (existingOrder.status !== OrderStatus.OPEN || existingOrder.courierId !== null) {
        throw new AppError(
            "This request has already been accepted and cannot be canceled",
            409,
        );
    }

    // Ensure the order has a credit reservation before allowing it to be canceled
    if (!existingOrder.creditReservationId) {
        throw new AppError("This order does not have a credit reservation to release", 409);
    }

    // Ensure the version matches the current version for optimistic concurrency control
    if (existingOrder.version !== input.expectedVersion) {
        throw new AppError("The request changed while you were canceling it. Reload and try again.", 409);
    }

    const eventId = randomUUID();
    const canceledAt = new Date();
    const reason = input.cancellationReason ?? null;

    const eventPayload = {
        eventId: eventId,
        eventType: OrderEventType.ORDER_CANCELED,
        reservationId: existingOrder.creditReservationId,
        orderId: existingOrder.id,
        requesterId: existingOrder.requesterId,
        amount: existingOrder.offeredCredits,
    };

    return prisma.$transaction(async (tx) => {
        const updatedOrder = await tx.order.updateMany({
            where: {
                id: orderId,
                requesterId: requesterId,
                courierId: null,
                status: OrderStatus.OPEN,
                version: input.expectedVersion,
            },
            data: {
                status: OrderStatus.CANCELED,
                canceledAt: canceledAt,
                cancellationReason: reason,
                version: { increment: 1 },
            },
        });

        if (updatedOrder.count !== 1) {
            throw new AppError("The request changed while you were canceling it. Reload and try again.", 409);
        }

        await tx.orderStatusHistory.create({
            data: {
                orderId: orderId,
                fromStatus: OrderStatus.OPEN,
                toStatus: OrderStatus.CANCELED,
                changedBy: requesterId,
                reason: reason
            },
        });

        await tx.outboxEvent.create({
            data: {
                id: eventId,
                orderId: orderId,
                eventType: OrderEventType.ORDER_CANCELED,
                payload: eventPayload,
            },
        });

        return tx.order.findUniqueOrThrow({
            where: { id: orderId },
        });
    });
};

export async function renewExpiredRequestService(
    requesterId: string,
    orderId: string,
    input: RenewExpiredRequestInput,
) {
    if (input.expiryAt <= new Date()) {
        throw new AppError("Completion deadline must be in the future", 400);
    }

    const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
    });

    // Ensure the order exists and belongs to the requester
    if (!existingOrder || existingOrder.requesterId !== requesterId) {
        throw new AppError("Order not found", 404);
    }

    // Ensure the order is in EXPIRED status before allowing it to be renewed
    if (existingOrder.status !== OrderStatus.EXPIRED) {
        throw new AppError("Only expired requests can be renewed", 409);
    }

    // Ensure the order has a credit reservation before allowing it to be renewed
    if (!existingOrder.creditReservationId) {
        throw new AppError("This order does not have a credit reservation to renew", 409);
    }

    // Ensure the version matches the current version for optimistic concurrency control
    if (existingOrder.version !== input.expectedVersion) {
        throw new AppError("The request changed while you were renewing it. Reload and try again.", 409);
    }

    // Check if a renewal is already pending for this order
    if (existingOrder.renewalPending) {
        throw new AppError("A renewal request is already being processed", 409);
    }

    const eventId = randomUUID();
    return prisma.$transaction(async (tx) => {
        const renewedOrder = await tx.order.updateMany({
            where: {
                id: orderId,
                requesterId: requesterId,
                creditReservationId: existingOrder.creditReservationId,
                status: OrderStatus.EXPIRED,
                version: input.expectedVersion,
                renewalPending: false, // Ensure no other renewal is pending
            },
            data: {
                renewalPending: true, // Mark the order as having a pending renewal
                renewalFailureCode: null,
            },
        });

        if (renewedOrder.count !== 1) {
            throw new AppError("The request changed while you were renewing it. Reload and try again.", 409);
        }

        await tx.outboxEvent.create({
            data: {
                id: eventId,
                orderId: existingOrder.id,
                eventType: OrderEventType.RESERVE_CREDITS,
                payload: {
                    eventId: eventId,
                    eventType: "RESERVE_CREDITS",
                    requestType: "RENEW",
                    orderId: existingOrder.id,
                    requesterId,
                    amount: existingOrder.offeredCredits,
                    previousReservationId: existingOrder.creditReservationId,
                    expectedVersion: input.expectedVersion,
                    expiryAt: input.expiryAt.toISOString(),
                } as Prisma.InputJsonValue,
            },
        });

        return tx.order.findUniqueOrThrow({
            where: { id: orderId },
        });
    });
};