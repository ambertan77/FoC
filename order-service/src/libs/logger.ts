// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Generated the shared pino logger: JSON output with a string level for Loki, secret redaction, and a request-ID mixin backed by AsyncLocalStorage.
// Author review: Pending review by the author.

import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";

/** Per-request store; the request middleware fills it so every log line in that request carries `reqId`. */
export const requestContext = new AsyncLocalStorage<{ reqId: string }>();

export const logger = pino({
    // Unit tests stay quiet unless LOG_LEVEL is set explicitly.
    level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
    base: { service: "order-service" },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Emit "level":"info" instead of pino's numeric 30 so Loki/Grafana can filter by name.
    formatters: { level: label => ({ level: label }) },
    mixin: () => ({ reqId: requestContext.getStore()?.reqId }),
    // Defence in depth: never emit credentials, even if one lands in a logged object.
    redact: {
        // "*.x" only matches one level deep, so list top-level keys separately.
        paths: [
            "authorization",
            "cookie",
            "password",
            "otp",
            "token",
            "accessToken",
            "refreshToken",
            "*.authorization",
            "*.cookie",
            "*.password",
            "*.otp",
            "*.token",
            "*.accessToken",
            "*.refreshToken",
            "req.headers.authorization",
            "req.headers.cookie",
            'res.headers["set-cookie"]',
        ],
        censor: "[REDACTED]",
    },
});
