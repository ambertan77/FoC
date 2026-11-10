// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated the startup sequence that runs bootstrapAdmin before listening, starts the outbox publisher, and bounds graceful SIGINT/SIGTERM shutdown with a deadline.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import "dotenv/config";
import authRouter from "./routes/auth.route.js";
import userRouter from "./routes/user.route.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import cookieParser from "cookie-parser";
import config from "./config/config.js";
import { AppError } from "./errors/errors.js";
import { prisma } from "./libs/prisma.js";
import { bootstrapAdmin } from "./services/bootstrap-admin.service.js";
import { startOutboxPublisher } from "./services/outbox-publisher.service.js";
import { logger } from "./libs/logger.js";
import { requestLogger } from "./middlewares/request-logger.middleware.js";

const app = express();

app.use(requestLogger);
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());
app.use(cookieParser(config.cookieSecret));

// Health check endpoint
app.get("/healthz", (_req: Request, res: Response) => {
    res.send("User service is running");
});

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);

// Catch all * not found routes
app.use((_req: Request, _res: Response) => {
    throw new AppError("Not found", 404);
});

app.use(errorHandler);

const PORT = config.port;

try {
    const result = await bootstrapAdmin(prisma);
    logger.info({ result }, "Admin bootstrap");
    let stopPublisher: (() => Promise<void>) | undefined;
    let shuttingDown = false;
    const server = app.listen(PORT, () => {
        logger.info({ port: PORT }, "User service is running");
        if (!shuttingDown) stopPublisher = startOutboxPublisher(prisma);
    });

    const shutdown = async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        // Bound shutdown even if a database or broker connection is stuck.
        // Unfinished outbox entries are recovered by the next process.
        const deadline = setTimeout(() => process.exit(1), 15_000);
        deadline.unref();
        try {
            await Promise.all([
                stopPublisher?.(),
                new Promise<void>((resolve, reject) => {
                    server.close(error => error ? reject(error) : resolve());
                }),
            ]);
            await prisma.$disconnect();
            clearTimeout(deadline);
        } catch (error) {
            logger.error({ err: error }, "User service shutdown failed");
            process.exitCode = 1;
        }
    };
    process.on("SIGINT", () => { void shutdown(); });
    process.on("SIGTERM", () => { void shutdown(); });
} catch (error) {
    logger.error(error instanceof Error ? error.message : "Admin bootstrap failed");
    await prisma.$disconnect();
    process.exitCode = 1;
}
