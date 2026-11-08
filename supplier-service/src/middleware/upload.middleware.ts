// AI Assistance Disclosure:
// Tool: Claude (Opus 5.5)
// Date: 2026-11-08
// Scope: Create boilerplate code for a middleware that checks whether the uploaded file is of a supported type and within the maximum allowed size
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import multer from "multer";
import { AppError } from "../errors/errors.js";

export const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIMETYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/avif",
]);

// multer middleware helps to check that the uploaded file is of an allowed type, and within the maximum allowed file size
// the uploaded file is stored in memory, before the controller is ran
export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE }, // multer reads the file into memory and throws an error when MAX_FILE_SIZE is reached
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMETYPES.has(file.mimetype)) {
            cb(null, true); // no errors raise, the uploaded file is set as req.file in the controller
            return;
        }
        cb(new AppError("Only jpeg, png, gif, webp and avif files are allowed", 400, "BAD_REQUEST"));
    },
});
