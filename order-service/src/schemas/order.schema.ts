import { z } from "zod";
import { OrderStatus } from "../generated/prisma/client.js";

const orderStatuses = Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]];

export const getAllOrdersSchema = z.object({
    page: z.coerce.number().int().positive(),
    status: z.enum(orderStatuses).optional(),
    sortBy: z.enum(["createdAt", "expiryAt"]).default("createdAt"),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    filterLocation: z.string().optional(), // the string passed in here should be the supplierId
    searchString: z.string().optional()
});

export type GetAllOrdersInput = z.infer<typeof getAllOrdersSchema>;
