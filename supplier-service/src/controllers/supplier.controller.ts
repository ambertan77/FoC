// AI Assistance Disclosure:
// Tool & model: GPT-6.1-Sol (high)
// Disclosure date: 2026-11-11 (retrospective; original development dates not supplied)
// Contributor: Duong Ngoc Mai
// Scope: HTTP handlers for creating, updating, deactivating and activating suppliers.
// Usage log: /ai/usage-log.md, Detailed AI Usage Log for Duong Ngoc Mai.

import type { Request, Response } from "express";
import { AppError } from "../errors/errors.js";
import { prisma } from "../libs/prisma.js";
import {
    createSupplierSchema,
    getSupplierSchema,
    parseInput,
    supplierIdsQuerySchema,
    updateSupplierSchema,
} from "../schemas/supplier.schema.js";
import {
    createSupplier as createSupplierService,
    fetchActiveSuppliers,
    fetchAllSuppliers,
    updateSupplier as updateSupplierService,
    getSuppliersByIdsService,
    deactivateSupplier as deactivateSupplierService,
    activateSupplier as activateSupplierService
} from "../services/supplier.service.js";

export async function getSuppliers(req: Request, res: Response) {
    const query = getSupplierSchema.safeParse(req.query);
    if (!query.success) {
        throw new AppError("Parameters not input correctly", 400);
    }

    const suppliers = await fetchAllSuppliers(query.data.status, query.data.page, query.data.searchString, query.data.typeFilter);

    return res.status(200).json({
        success: true,
        message: "All suppliers (after filtering) fetched successfully",
        data: suppliers,
    });
}


export async function getActiveSuppliers(req: Request, res: Response) {
    const query = getSupplierSchema.safeParse(req.query);
    if (!query.success) {
        throw new AppError("Parameters not input correctly", 400);
    }

    const suppliers = await fetchActiveSuppliers(query.data.page, query.data.searchString, query.data.typeFilter);

    return res.status(200).json({
        success: true,
        message: "Active suppliers (after filtering) fetched successfully",
        data: suppliers,
    });
}


export async function getSuppliersByIds(req: Request, res: Response) {
    const parsedQuery = supplierIdsQuerySchema.safeParse(req.query);

    if (!parsedQuery.success) {
        throw new AppError(
            parsedQuery.error.issues.at(0)?.message ?? "Invalid supplier IDs",
            400,
        );
    }

    const suppliers = await getSuppliersByIdsService(parsedQuery.data.ids);

    res.status(200).json({
        success: true,
        message: "Suppliers retrieved successfully",
        data: suppliers,
    });
}


export async function updateSupplier(req: Request, res: Response) {
    const id = req.params.supplierId;

    if (typeof id !== "string" || !id) {
        throw new AppError("Supplier id is required", 400, "BAD_REQUEST");
    }

    const input = parseInput(updateSupplierSchema, req.body);
    const supplier = await updateSupplierService(prisma, id, input);

    return res.status(200).json({
        success: true,
        code: "SUCCESS",
        data: supplier,
    });
}


export async function createSupplier(req: Request, res: Response) {
    const input = parseInput(createSupplierSchema, req.body);
    const supplier = await createSupplierService(prisma, input);

    return res.status(201).json({
        success: true,
        code: "SUCCESS",
        data: supplier,
    });
}

export async function deactivateSupplier(req: Request, res: Response) {
    const id = req.params.supplierId;

    if (typeof id !== "string" || !id) {
        throw new AppError("Supplier id is required", 400, "BAD_REQUEST");
    }

    const supplier = await deactivateSupplierService(prisma, id);

    return res.status(200).json({
        success: true,
        code: "SUCCESS",
        data: supplier,
    });
}

export async function activateSupplier(req: Request, res: Response) {
    const id = req.params.supplierId;

    if (typeof id !== "string" || !id) {
        throw new AppError("Supplier id is required", 400, "BAD_REQUEST");
    }

    const supplier = await activateSupplierService(prisma, id);

    return res.status(200).json({
        success: true,
        code: "SUCCESS",
        data: supplier,
    });
}
