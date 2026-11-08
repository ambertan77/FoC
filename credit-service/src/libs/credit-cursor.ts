// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated encodeTransactionCursor/decodeTransactionCursor for opaque base64url cursors, rejecting malformed cursors with a 400.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { AppError } from "../errors/errors.js";
import { transactionCursorSchema, type TransactionCursor } from "../schemas/credit.schema.js";

export function decodeTransactionCursor(token: string): TransactionCursor {
    try {
        // Buffer's decoder is permissive; require canonical, unpadded base64url.
        if (token.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(token)) {
            throw new Error("Invalid encoding");
        }
        const bytes = Buffer.from(token, "base64url");
        if (bytes.toString("base64url") !== token) throw new Error("Invalid encoding");
        const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return transactionCursorSchema.parse(JSON.parse(json));
    } catch {
        throw new AppError("Invalid cursor", 400);
    }
}

export function encodeTransactionCursor(cursor: TransactionCursor): string {
    return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}
