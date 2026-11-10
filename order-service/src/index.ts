// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Mounted the request logger first and replaced console.* with the pino logger.
// Author review: Reviewed, tested, checked by the author.

import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import "dotenv/config";
import config from "./config/config.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { requestLogger } from "./middleware/request-logger.middleware.js";
import { AppError } from "./errors/errors.js";
import orderRouter from "./routes/order.route.js";
import { startOrderOutboxPublisher } from "./workers/order-outbox.publisher.js";
import { prisma } from "./libs/prisma.js";
import { startOrderExpiryWorker } from "./workers/order-expiry.worker.js";
import { startOrderReceiptWorker } from "./workers/order-receipt.worker.js";
import { startCreditReservationResultConsumer } from "./workers/credit-reservation-result.consumer.js";
import { logger } from "./libs/logger.js";

const app = express();

app.use(requestLogger);
app.use(
    cors({
        origin: config.frontendUrl,
        credentials: true,
    }),
);

app.use(express.json());

// Health check endpoint
app.get("/healthz", (_req: Request, res: Response) => {
    res.send("Orders service is running");
});

app.use("/api/orders", orderRouter);

// Catch all * not found routes
app.use((_req: Request, _res: Response) => {
    throw new AppError("Not found", 404);
});

app.use(errorHandler);

const PORT = config.port;

let stopOutboxPublisher: (() => Promise<void>) | undefined;
let stopOrderExpiryWorker: (() => Promise<void>) | undefined;
let stopOrderReceiptWorker: (() => Promise<void>) | undefined;
let stopCreditReservationResultConsumer: (() => Promise<void>) | undefined;
let shuttingDown = false;

const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "Order service is running");

    // If the service is not shutting down, start the outbox publisher.
    if (!shuttingDown) {
        stopOutboxPublisher = startOrderOutboxPublisher();
        stopOrderExpiryWorker = startOrderExpiryWorker();
        stopOrderReceiptWorker = startOrderReceiptWorker();
        stopCreditReservationResultConsumer = startCreditReservationResultConsumer();
    }
});

const shutdown = async () => {
    if (shuttingDown) return; // Prevent multiple shutdown attempts
    shuttingDown = true;

    const deadline = setTimeout(() => process.exit(1), 15_000);
    deadline.unref();

    logger.info("Shutting down gracefully...");

    try {
        await Promise.all([
            stopOutboxPublisher?.(),
            stopOrderExpiryWorker?.(),
            stopOrderReceiptWorker?.(),
            stopCreditReservationResultConsumer?.(),
            new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            }),
        ]);
        await prisma.$disconnect();
        clearTimeout(deadline);
        logger.info("Shutdown complete.");
    } catch (error) {
        logger.error({ err: error }, "Order service shutdown failed");
        process.exitCode = 1;
    }
};

process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
