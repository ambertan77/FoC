import type { Request, Response } from "express";
import { AppError } from "../errors/errors.js";
import { supplierTypeSchema } from "../schemas/supplier.type.schema.js";
import { countForEachType, createType, deleteType, fetchSupplierTypes } from "../services/supplier.type.service.js";

export async function getAllSupplierTypes(req: Request, res: Response) {
    const types = await fetchSupplierTypes();

    return res.status(200).json({
        success: true,
        message: "All supplier types queried successfully",
        data: types,
    });
}

export async function countSuppliersForType(req: Request, res: Response) {
    const counts = await countForEachType();

    return res.status(200).json({
        success: true,
        message: "Data fetched successfully",
        data: counts,
    });
}

export async function createSupplierType(req: Request, res: Response) {
    const request = supplierTypeSchema.safeParse(req.body);
    if (!request.success) {
        // we need to make sure this block is not reached, i.e. the request body has a "type" field
        request.error; // ZodError instance
        throw new AppError("Parameters not input correctly", 400);
    }
    const newType = await createType(request.data.type);

    return res.status(200).json({
        success: true,
        message: "New supplier type created successfully",
        data: newType,
    });
}

export async function deleteSupplierType(req: Request, res: Response) {
    const supplierTypeId = req.params.typeId as string;

    const deletedType = await deleteType(supplierTypeId);

    return res.status(200).json({
        success: true,
        message: "Existing supplier type deleted successfully",
        data: deletedType,
    });
}
