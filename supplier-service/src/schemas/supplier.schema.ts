// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: Supplier creation and update payload validation and inferred input types.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import { z, ZodError } from "zod";
import { Day, SupplierStatus } from "../generated/prisma/enums.js";
import { AppError } from "../errors/errors.js";

const dayValues = Object.values(Day) as [string, ...string[]];

const supplierStatus = ["ALL", ...Object.values(SupplierStatus)];

const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export const openingHoursSchema = z.object({
    day: z.enum(dayValues, { error: "Invalid day of week" }),
    openingTime: z.string().regex(timePattern, {
        error: "Opening time must be in HH:MM (24-hour) format",
    }),
    closingTime: z.string().regex(timePattern, {
        error: "Closing time must be in HH:MM (24-hour) format",
    }),
});

export const createSupplierSchema = z.object({
    name: z.string().trim().min(1, { error: "Name is required" }),
    type: z.string().trim().min(1, { error: "Type is required" }),
    building: z.string().trim().min(1, { error: "Building is required" }),
    floor: z.string().trim().min(1, { error: "Floor is required" }),
    description: z.string().min(1, { error: "Description is required" }),
    address: z.string().min(1, { error: "Address is required" }),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    imageUrl: z.string().min(1, { error: "Image URL must not be empty" }).nullable().optional(),
    openingHours: z.array(openingHoursSchema).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const getSupplierSchema = z.object({
    status: z.enum(supplierStatus).optional(),
    page: z.coerce.number().int().positive().optional(), // optional page, if null then no pagination is required
    searchString: z.string().nullable().optional(),
    typeFilter: z.string().nullable().optional(), // filter by supplier type
})

export const supplierIdsQuerySchema = z.object({
    ids: z.preprocess(
        (value) => (Array.isArray(value) ? value : value === undefined ? [] : [value]),
        z.array(z.string().trim().min(1)).min(1).max(100),
    ),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type OpeningHoursInput = z.infer<typeof openingHoursSchema>;
export type GetSupplierInput = z.infer<typeof getSupplierSchema>;

export function parseInput<T>(schema: z.ZodSchema<T>, body: unknown): T {
    try {
        return schema.parse(body);
    } catch (error) {
        const issue = error instanceof ZodError ? error.issues[0] : undefined;
        throw new AppError(
            issue?.message ?? "Invalid request body",
            422,
            "UNPROCESSABLE_ENTITY",
        );
    }
}
