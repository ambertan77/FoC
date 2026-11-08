// AI Assistance Disclosure:
// Tool: Claude (Opus 5.5)
// Date: 2026-11-08
// Scope: Refactor asset controllers to use the new storage service interface for S3 and local storage
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import type { Request, Response } from "express";
import { pipeline } from "node:stream/promises";
import { AppError } from "../errors/errors.js";
import { getImage, uploadImage } from "../services/supplier.asset.service.js";

// get file using filename
export async function serveAsset(req: Request, res: Response) {
    const { body, contentType } = await getImage(req.params.filename as string);

    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    await pipeline(body, res);
}

// add new supplier image
export async function uploadSupplierImage(req: Request, res: Response) {
    if (!req.file) {
        throw new AppError("No image file provided", 400, "BAD_REQUEST");
    }

    const imageUrl = await uploadImage(req.file);

    return res.status(200).json({
        success: true,
        code: "SUCCESS",
        data: { imageUrl },
    });
}
