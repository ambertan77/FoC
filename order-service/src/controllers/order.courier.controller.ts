import type { Request, Response } from "express";
import { AppError } from "../errors/errors.js";
import type { AuthRequest } from "../types/auth.types.js";
import { getCourierOrderHistorySchema, getOpenOrdersSchema, courierUpdateStatusSchema } from "../schemas/order.courier.schema.js";
import { 
    acceptOpenOrder, 
    completePickedUpOrder, 
    dropAcceptedOrder, 
    getAllOpenOrders, 
    getCourierAcceptanceHistory, 
    pickUpAcceptedOrder 
} from "../services/order.courier.service.js";

export async function getOpenOrders(req: AuthRequest, res: Response) {
    const courierId = req.user!.userId;
    const query = req.query;

    const request = getOpenOrdersSchema.safeParse(query);
    if (!request.success) {
        throw new AppError(request.error.issues.at(0)?.message || "Invalid query", 400);
    }
    const result = await getAllOpenOrders(courierId, request.data);

    return res.status(200).json({
        success: true,
        message: `${result.orders.length} orders on page ${request.data.page} retrieved`,
        data: result,
    });
}

export async function acceptOrder(req: AuthRequest, res: Response) {
    const courierId = req.user!.userId;
    const orderId = req.params.orderId as string; // can safely typecast to a single string since this is a route parameter
    
    const body = req.body;
    const request = courierUpdateStatusSchema.safeParse(body);
    if (!request.success) {
        throw new AppError(request.error.issues.at(0)?.message || "Invalid JSON body", 400);
    }

    const updatedOrder = await acceptOpenOrder(courierId, orderId, request.data);

    return res.status(200).json({
        success: true,
        message: `Order successfully accepted by courier`,
        data: updatedOrder,
    });
}

export async function pickUpOrder(req: AuthRequest, res: Response) {
    const courierId = req.user!.userId;
    const orderId = req.params.orderId as string; // can safely typecast to a single string since this is a route parameter

    const body = req.body;
    const request = courierUpdateStatusSchema.safeParse(body);
    if (!request.success) {
        throw new AppError(request.error.issues.at(0)?.message || "Invalid JSON body", 400);
    }

    const updatedOrder = await pickUpAcceptedOrder(courierId, orderId, request.data);

    return res.status(200).json({
        success: true,
        message: `Order successfully picked up by courier`,
        data: updatedOrder,
    });
}

export async function completeOrder(req: AuthRequest, res: Response) {
    const courierId = req.user!.userId;
    const orderId = req.params.orderId as string; // can safely typecast to a single string since this is a route parameter

    const body = req.body;
    const request = courierUpdateStatusSchema.safeParse(body);
    if (!request.success) {
        throw new AppError(request.error.issues.at(0)?.message || "Invalid JSON body", 400);
    }

    const updatedOrder = await completePickedUpOrder(courierId, orderId, request.data);
    
    return res.status(200).json({
        success: true,
        message: `Order successfully completed by courier`,
        data: updatedOrder,
    });
}

export async function dropOrder(req: AuthRequest, res: Response) {
    const courierId = req.user!.userId;
    const orderId = req.params.orderId as string; // can safely typecast to a single string since this is a route parameter

    const body = req.body;
    const request = courierUpdateStatusSchema.safeParse(body);
    if (!request.success) {
        throw new AppError(request.error.issues.at(0)?.message || "Invalid JSON body", 400);
    }

    const updatedOrder = await dropAcceptedOrder(courierId, orderId, request.data);
    
    return res.status(200).json({
        success: true,
        message: `Order successfully dropped by courier`,
        data: updatedOrder,
    });
}

export async function getCourierOrderHistory(req: AuthRequest, res: Response) {
    const courierId = req.user!.userId;
    const query = req.query;

    const request = getCourierOrderHistorySchema.safeParse(query);
    if (!request.success) {
        throw new AppError(request.error.issues.at(0)?.message || "Invalid query", 400);
    }
    const result = await getCourierAcceptanceHistory(courierId, request.data);

    return res.status(200).json({
        success: true,
        message: `Courier order history retrieved successfully`,
        data: result,
    });
}