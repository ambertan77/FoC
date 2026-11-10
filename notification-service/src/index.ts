import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import "dotenv/config";
import config from "./config/config.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { requestLogger } from "./middleware/request-logger.middleware.js";
import { AppError } from "./errors/errors.js";
import { prisma } from "./libs/prisma.js";
import notificationRouter from "./routes/notification.route.js";
import { hub } from "./sse/hub.js";
import { startOrderStatusConsumer } from "./workers/order-status.consumer.js";
import { logger } from "./libs/logger.js";

const app = express();

app.use(requestLogger);
app.use(
    cors({
        origin: config.frontendUrl,
        credentials: true,
    }),
);

app.use(express.json({ limit: "16kb" }));

// Health check endpoint
app.get("/healthz", (_req, res) => {
    res.json({
        ok: true,
        sseConnections: hub.connections,
    });
});

app.use("/api/notifications", notificationRouter);

// Catch all * not found routes
app.use((_req: Request, _res: Response) => {
    throw new AppError("Not found", 404);
});

app.use(errorHandler);

const heartbeat = hub.startHeartbeat();
const PORT = config.port;

let stopOrderStatusConsumer: (() => Promise<void>) | undefined;
let shuttingDown = false;

const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "Notification service is running");

    // If the service is not shutting down, start the outbox publisher.
    if (!shuttingDown) {
        stopOrderStatusConsumer = startOrderStatusConsumer();
    }
});

const shutdown = async () => {
    if (shuttingDown) return; // Prevent multiple shutdown attempts
    shuttingDown = true;

    const deadline = setTimeout(() => process.exit(1), 15_000);
    deadline.unref();

    logger.info("Shutting down gracefully...");

    try {
        clearInterval(heartbeat);
        hub.closeAll(); // SSE streams never end by themselves and would block server.close()
        await Promise.all([
            stopOrderStatusConsumer?.(),
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
        logger.error({ err: error }, "Notification service shutdown failed");
        process.exitCode = 1;
    }
};

process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
