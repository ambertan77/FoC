import { z } from "zod";
import { OrderStatus } from "../generated/prisma/client.js";

const orderStatuses = Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]];

export const getAllOrdersSchema = z.object({
    page: z.coerce.number().int().positive(),
    // transform comma-separated string values into an array with elements of type OrderStatus
    statuses: z.string().transform((s) => s.split(",")).pipe(z.array(z.enum(orderStatuses))).optional(),
    sortBy: z.enum(["createdAt", "expiryAt"]).default("createdAt"),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    filterLocation: z.string().optional(), // the string passed in here should be the supplierId
    searchString: z.string().optional()
});

export type GetAllOrdersInput = z.infer<typeof getAllOrdersSchema>;
