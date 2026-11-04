import { z } from "zod";
import { OrderStatus } from "../generated/prisma/client.js";

const orderStatuses = Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]];

export const getOpenOrdersSchema = z.object({
    page: z.coerce.number().int().positive(),
    sortBy: z.enum(["offeredCredits", "expiryAt"]).default("expiryAt"),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    filterLocation: z.string().optional(), // the string passed in here should be the supplierId
    searchString: z.string().optional()
});

export const getCourierOrderHistorySchema = z.object({
    page: z.coerce.number().int().positive(),
    sortBy: z.enum(["acceptedAt", "expiryAt"]).default("acceptedAt"),
    status: z.enum(orderStatuses).optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc') 
});

export const courierUpdateStatusSchema = z.object({
    expectedVersion: z.coerce.number().int().positive() // expected version for optimistic concurrency control
})

export type GetOpenOrdersInput = z.infer<typeof getOpenOrdersSchema>;
export type GetCourierOrderHistoryInput = z.infer<typeof getCourierOrderHistorySchema>;
export type CourierUpdateStatusInput = z.infer<typeof courierUpdateStatusSchema>;
