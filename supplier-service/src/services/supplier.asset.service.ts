// AI Assistance Disclosure:
// Tool: Claude (Opus 5.5)
// Date: 2026-11-08
// Scope: Create boilerplate code that supports uploading and serving supplier images
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import { AppError } from "../errors/errors.js";
import { storage } from "../libs/storage.js";

const MIME_BY_EXTENSION: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
};

// give a random uuid as the filename to avoid images with the same filename
const uniqueFilename = (originalname: string): string => {
    const fileExtension = path.extname(originalname).toLowerCase();
    return `${randomUUID()}${fileExtension}`;
};

export const getContentType = (filename: string): string => {
    const fileExtension = path.extname(filename).toLowerCase();
    // file names must align with their mime type
    if (!MIME_BY_EXTENSION[fileExtension]) {
        throw new AppError(`Unsupported file type: ${fileExtension}. Ensure that filenames have the allowed extensions.`, 400, "BAD_REQUEST");
    }
    return MIME_BY_EXTENSION[fileExtension];
};

// this function stores a new supplier image and returns its public URL
export async function uploadImage(file: Express.Multer.File): Promise<string> {
    const filename = uniqueFilename(file.originalname);
    return storage.save(filename, file.buffer, getContentType(filename));
}

// this function returns a stored supplier image by its file name
export async function getImage(filename: string): Promise<{ body: Readable; contentType: string }> {
    const contentType = getContentType(filename);
    const body = await storage.read(filename); // if null is returned, the image was not found
    if (!body) {
        throw new AppError(`No file named ${filename} was found`, 404, "NOT_FOUND");
    }
    return { body, contentType };
}
