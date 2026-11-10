// AI Assistance Disclosure:
// Tool: Claude Code (Opus 5.5)
// Date: 2026-11-05
// Scope: Generated lines 42-51 and 73-82 to allow filtering by a date range and a subset of order statuses.
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import { AppError } from "../errors/errors.js";
import { prisma } from "../libs/prisma.js";
import type { GetAllOrdersInput } from "../schemas/order.schema.js";
import { OrderStatus } from "../generated/prisma/client.js";

// page limit (max 15 orders per page)
const LIMIT: number = 15;

export async function getAllOrders(input: GetAllOrdersInput) {
    const page: number = input.page;
    const statuses: OrderStatus[] | undefined = input.statuses;
    const sortBy: string = input.sortBy; // default set to sorting by created time
    const sortOrder: string = input.sortOrder; // default set to sorting in descending order (latest to earliest)
    const filterLocation = input.filterLocation ?? null; // supplier id we want to filter by
    const searchString: string = input.searchString ?? "";
    const startDate: Date | undefined = input.startDate; 
    const endDate: Date | undefined = input.endDate; 

    const now = new Date();

    const orders = await prisma.order.findMany({
        where: {
            name: {
                contains: searchString, // enforce partial string match
                mode: 'insensitive', // enforce case insensitivity
            },
            // as long as delivery/pickup supplier id matches, record will be included in the results
            ...(filterLocation
                ? {
                    OR: [
                        { deliverySupplierId: filterLocation },
                        { pickupSupplierId: filterLocation },
                    ],
                }
                : {}),
            ...(statuses ? { status: { in: statuses } } : {}), // If status is provided, include it in the where clause; otherwise, don't filter by status 
            // if startDate and endDate are provided, filter the orders created between this period (both dates inclusive)
            ...(startDate && endDate
                ? {
                    createdAt: {
                        ...(startDate ? { gte: startDate } : {}),
                        ...(endDate ? { lte: endDate } : {}),
                    },
                }
                : {}),
        },
        orderBy: { [sortBy]: sortOrder },
        take: LIMIT,
        skip: LIMIT * (page - 1),
    });

    const totalCount = await prisma.order.count({
        where: {
            name: {
                contains: searchString, // enforce partial string match
                mode: 'insensitive', // enforce case insensitivity
            },
            // as long as delivery/pickup supplier id matches, record will be included in the results
            ...(filterLocation
                ? {
                    OR: [
                        { deliverySupplierId: filterLocation },
                        { pickupSupplierId: filterLocation },
                    ],
                }
                : {}),
            ...(statuses ? { status: { in: statuses } } : {}), // If status is provided, include it in the where clause; otherwise, don't filter by status
             // if startDate and endDate are provided, filter the orders created between this period (both dates inclusive)
            ...(startDate && endDate
                ? {
                    createdAt: {
                        ...(startDate ? { gte: startDate } : {}),
                        ...(endDate ? { lte: endDate } : {}),
                    },
                }
                : {}),
        }
    });

    if (!orders) {
        throw new AppError("No records found for this page", 400);
    }

    return {
        orders,
        pagination: {
            limit: LIMIT,
            page: page,
            totalCount: totalCount,
            totalPages: Math.ceil(totalCount / LIMIT),
        }
    };
}
