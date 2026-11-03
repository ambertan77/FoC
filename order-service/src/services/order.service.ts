import { AppError } from "../errors/errors.js";
import { prisma } from "../libs/prisma.js";
import type { GetAllOrdersInput } from "../schemas/order.schema.js";
import { OrderStatus } from "../generated/prisma/client.js";

// page limit (max 15 orders per page)
const LIMIT: number = 15;

export async function getAllOrders(input: GetAllOrdersInput) {
    const page: number = input.page;
    const status: OrderStatus | undefined = input.status;
    const sortBy: string = input.sortBy; // default set to sorting by created time
    const sortOrder: string = input.sortOrder; // default set to sorting in descending order (latest to earliest)
    const filterLocation = input.filterLocation ?? null; // supplier id we want to filter by
    const searchString: string = input.searchString ?? "";
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
            ...(status ? { status: status } : {}), // If status is provided, include it in the where clause; otherwise, don't filter by status 
            expiryAt: {
                gt: now // only include orders that have not yet expired
            }
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
            ...(status ? { status: status } : {}), // If status is provided, include it in the where clause; otherwise, don't filter by status
            expiryAt: {
                gt: now // only include orders that have not yet expired
            }
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
