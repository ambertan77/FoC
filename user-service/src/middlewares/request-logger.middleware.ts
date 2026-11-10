// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Generated the request middleware: assigns or reuses x-request-id, scopes it for all logs in the request, and writes one access-log line per response.
// Author review: Reviewed, tested, checked by Duong Ngoc Mai.

import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { pinoHttp } from "pino-http";
import { logger, requestContext } from "../libs/logger.js";

// The gateway sets x-request-id; accept only a short, plain token so a client
// can't inject newlines or oversized values into logs.
const VALID_REQUEST_ID = /^[\w-]{1,64}$/;

const assignRequestId: RequestHandler = (req, res, next) => {
    const incoming = req.headers["x-request-id"];
    const reqId = typeof incoming === "string" && VALID_REQUEST_ID.test(incoming)
        ? incoming
        : randomUUID();

    req.id = reqId;
    res.setHeader("x-request-id", reqId);
    requestContext.run({ reqId }, next);
};

const accessLog = pinoHttp({
    logger,
    genReqId: req => req.id,
    // Health checks fire every few seconds from Docker and the deploy script.
    autoLogging: { ignore: req => req.url === "/healthz" },
    customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    // Log only what's needed; the default serializer includes every header.
    serializers: {
        req: req => ({ id: req.id, method: req.method, url: req.url?.split("?")[0] }),
        res: res => ({ statusCode: res.statusCode }),
    },
});

export const requestLogger: RequestHandler[] = [assignRequestId, accessLog];
