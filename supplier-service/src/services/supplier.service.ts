import { AppError } from "../errors/errors.js";
import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { Day } from "../generated/prisma/enums.js";
import { prisma } from "../libs/prisma.js";
import type { CreateSupplierInput, OpeningHoursInput, UpdateSupplierInput } from "../schemas/supplier.schema.js";

// constants

export const STATUS = {
    ACTIVATED: "ACTIVATED",
    DEACTIVATED: "DEACTIVATED",
} as const;

const LIMIT: number = 15; // only a max of 15 suppliers per page is displayed per page


// helper functions

function toPrismaTime(time: string): Date {
    // Opening hours are stored as wall-clock SGT. Parse "HH:MM" / "HH:MM:SS"
    // as a UTC instant so the value round-trips identically regardless of the
    // server timezone and matches the frontend's getUTCHours rendering.
    const [hours, minutes, seconds = "00"] = String(time).split(":");
    return new Date(Date.UTC(1970, 0, 1, Number(hours), Number(minutes), Number(seconds)));
}

function assertNoDuplicateDays(openingHours: OpeningHoursInput[] | undefined): void {
    const seen = new Set<string>();
    for (const hour of openingHours ?? []) {
        if (seen.has(hour.day)) {
            throw new AppError(
                `Duplicate opening hours for ${hour.day}`,
                400,
                "BAD_REQUEST",
            );
        }
        seen.add(hour.day);
    }
}

function mapOpeningHours(input: OpeningHoursInput[]) {
    return input.map((hour) => ({
        day: hour.day as Day,
        openingTime: toPrismaTime(hour.openingTime),
        closingTime: toPrismaTime(hour.closingTime),
    }));
}

async function ensureSupplierTypeExists(
    prisma: PrismaClient,
    type: string,
): Promise<void> {
    const supplierType = await prisma.supplierType.findUnique({
        where: { type },
    });

    if (!supplierType) {
        throw new AppError(
            `Supplier type "${type}" does not exist`,
            404,
            "NOT_FOUND",
        );
    }
}

async function findSupplierByName(
    prisma: PrismaClient,
    name: string,
): Promise<boolean> {
    const existing = await prisma.supplier.findMany({
        where: { name: { equals: name, mode: "insensitive" } },
    });

    return existing.length > 0;
}


// supplier service functions

export async function fetchAllSuppliers(page?: number, searchString?: string | null, typeFilter?: string | null) {
    const search = searchString ?? "";
    let type = "";
    if (typeFilter && typeFilter.toLowerCase() !== "all") {
        type = typeFilter;
    }
    const suppliers = await prisma.supplier.findMany({
        where: {
            name: {
                contains: search, // enforce partial string match
                mode: 'insensitive', // enforce case insensitivity
            },
            type: {
                contains: type, // should return all types if typeFilter is empty
                mode: 'insensitive',
            }
        },
        include: { openingHours: true }, // also get opening hours of suppliers
        orderBy: { name: 'asc' }, // case-sensitive
        ...(page ? { 
            take: LIMIT,
            skip: LIMIT * (page - 1),
        } : {}), // if page is not null, return paginated query; else return all results
    });

    if (!suppliers || suppliers.length == 0) {
        throw new AppError("No records found for this page", 400, "BAD_REQUEST");
    }

    const totalCount = await prisma.supplier.count({
        where: {
            name: {
                contains: search, // enforce partial string match
                mode: 'insensitive', // enforce case insensitivity
            },
            type: {
                contains: type, // should return all types if typeFilter is empty
                mode: 'insensitive',
            }
        }
    });

    return {
        suppliers,
        paginated: !!page, // true if page contains a value, false otherwise
        pagination: {
            limit: page ? LIMIT : null, // return LIMIT if page has a value, else return null
            page: page ?? null, // return null if page is empty
            totalCount: totalCount,
            totalPages: page ? Math.ceil(totalCount / LIMIT) : null,
        }
    };
}


export async function fetchActiveSuppliers(page?: number, searchString?: string | null, typeFilter?: string | null) {
    const search = searchString ?? "";
    let type = "";
    if (typeFilter && typeFilter.toLowerCase() !== "all") {
        type = typeFilter;
    }
    const suppliers = await prisma.supplier.findMany({
        where: {
            status: STATUS.ACTIVATED,
            name: {
                contains: search, // enforce partial string match
                mode: 'insensitive', // enforce case insensitivity
            },
            type: {
                contains: type, // should return all types if typeFilter is empty
                mode: 'insensitive',
            }
        },
        include: { openingHours: true }, // also get opening hours of suppliers
        orderBy: { name: 'asc' }, // case-sensitive
        ...(page ? { 
            take: LIMIT,
            skip: LIMIT * (page - 1),
        } : {}), // if page is not null, return paginated query; else return all results
    });

    if (!suppliers || suppliers.length == 0) {
        throw new AppError("No records found for this page", 400, "BAD_REQUEST");
    }

    const totalCount = await prisma.supplier.count({
        where: {
            status: STATUS.ACTIVATED,
            name: {
                contains: search, // enforce partial string match
                mode: 'insensitive', // enforce case insensitivity
            },
            type: {
                contains: type, // should return all types if typeFilter is empty
                mode: 'insensitive',
            }
        }
    });

    return {
        suppliers,
        paginated: !!page, // true if page contains a value, false otherwise
        pagination: {
            limit: page ? LIMIT : null, // return LIMIT if page has a value, else return null
            page: page ?? null, // return null if page is empty
            totalCount: totalCount,
            totalPages: page ? Math.ceil(totalCount / LIMIT) : null,
        }
    };
}


export async function getSupplierByIdService(
    supplierId: string
) {
    return prisma.supplier.findUnique({
        where: {
            id: supplierId,
            status: STATUS.ACTIVATED,
        },
    });
}


export async function getSuppliersByIdsService(ids: string[]) {
    return prisma.supplier.findMany({
        where: {
            id: { in: [...new Set(ids)] },
        },
        select: {
            id: true,
            name: true,
            type: true,
            status: true,
        },
    });
}


export async function createSupplier(
    prisma: PrismaClient,
    input: CreateSupplierInput,
): Promise<Prisma.SupplierModel> {
    if (await findSupplierByName(prisma, input.name)) {
        throw new AppError(
            "A supplier with this name already exists",
            409,
            "CONFLICT",
        );
    }

    assertNoDuplicateDays(input.openingHours);

    await ensureSupplierTypeExists(prisma, input.type);

    return prisma.supplier.create({
        data: {
            name: input.name,
            type: input.type,
            status: STATUS.ACTIVATED,
            building: input.building,
            floor: input.floor,
            description: input.description,
            address: input.address,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
            openingHours: {
                create: mapOpeningHours(input.openingHours ?? []),
            },
        },
        include: { openingHours: true },
    });
}


export async function updateSupplier(
    prisma: PrismaClient,
    id: string,
    input: UpdateSupplierInput,
): Promise<Prisma.SupplierModel> {
    const supplier = await prisma.supplier.findUnique({ where: { id } });

    if (!supplier) {
        throw new AppError("Supplier not found", 404, "NOT_FOUND");
    }

    if (input.openingHours !== undefined) {
        assertNoDuplicateDays(input.openingHours);
    }

    if (input.type !== undefined) {
        await ensureSupplierTypeExists(prisma, input.type);
    }

    if (input.name !== undefined && input.name.toLowerCase() !== supplier.name.toLowerCase()) {
        if (await findSupplierByName(prisma, input.name)) {
            throw new AppError(
                "A supplier with this name already exists",
                409,
                "CONFLICT",
            );
        }
    }

    const data: Prisma.SupplierUncheckedUpdateInput = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.type !== undefined) data.type = input.type;
    if (input.building !== undefined) data.building = input.building;
    if (input.floor !== undefined) data.floor = input.floor;
    if (input.description !== undefined) data.description = input.description;
    if (input.address !== undefined) data.address = input.address;
    if (input.latitude !== undefined) data.latitude = input.latitude ?? null;
    if (input.longitude !== undefined) data.longitude = input.longitude ?? null;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl ?? null;
    if (input.openingHours !== undefined) {
        data.openingHours = {
            deleteMany: {},
            create: mapOpeningHours(input.openingHours),
        };
    }

    if (Object.keys(data).length === 0) {
        throw new AppError(
            "No fields provided to update",
            400,
            "BAD_REQUEST",
        );
    }

    return prisma.supplier.update({
        where: { id },
        data,
        include: { openingHours: true },
    });
}


export async function activateSupplier(
    prisma: PrismaClient,
    id: string,
): Promise<Prisma.SupplierModel> {
    const supplier = await prisma.supplier.findUnique({
        where: { id },
        include: { openingHours: true },
    });

    if (!supplier) {
        throw new AppError("Supplier not found", 404, "NOT_FOUND");
    }

    if (supplier.status === STATUS.ACTIVATED) return supplier;

    return prisma.supplier.update({
        where: { id },
        data: { status: STATUS.ACTIVATED },
        include: { openingHours: true },
    });
}

export async function deactivateSupplier(
    prisma: PrismaClient,
    id: string,
): Promise<Prisma.SupplierModel> {
    const supplier = await prisma.supplier.findUnique({ where: { id } });

    if (!supplier) {
        throw new AppError("Supplier not found", 404, "NOT_FOUND");
    }

    if (supplier.status === STATUS.DEACTIVATED) {
        throw new AppError(
            "Supplier is already deactivated",
            409,
            "CONFLICT",
        );
    }

    return prisma.supplier.update({
        where: { id },
        data: { status: STATUS.DEACTIVATED },
        include: { openingHours: true },
    });
}
