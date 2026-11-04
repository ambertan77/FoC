import type { Response } from "express";
import { AppError } from "../errors/errors.js";
import type { AuthRequest } from "../types/auth.types.js";
import { getAllOrdersSchema } from "../schemas/order.schema.js";
import { getAllOrders as getAllOrdersService } from "../services/order.service.js";

export async function getAllOrders(req: AuthRequest, res: Response) {
    const query = req.query;

    const request = getAllOrdersSchema.safeParse(query);
    if (!request.success) {
        throw new AppError(request.error.issues.at(0)?.message || "Invalid query", 400);
    }
    const result = await getAllOrdersService(request.data);

    return res.status(200).json({
        success: true,
        message: `${result.orders.length} orders on page ${request.data.page} retrieved`,
        data: result,
    });
}
