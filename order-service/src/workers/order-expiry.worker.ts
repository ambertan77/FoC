// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Replaced console.* with the pino logger.
// Author review: Reviewed, tested, checked by the author.

import { updateExpiredOrders } from "../services/order-expiry.service.js";
import { logger } from "../libs/logger.js";

const POLL_INTERVAL_MS = 60_000; // Poll every 1 minutes for new orders to expire.

export function startOrderExpiryWorker(): () => Promise<void> {
    let stopped = false;
    let currentRun: Promise<void> | undefined;

    const runWorker = () => {
        // If the worker is stopped or a run is already in progress, skip this iteration.
        if (stopped || currentRun) {
            return;
        }

        currentRun = (async () => {
            try {
                // Call the service function to update expired orders
                const expiredOrdersCount = await updateExpiredOrders();

                if (expiredOrdersCount > 0) {
                    logger.info({ count: expiredOrdersCount }, "Orders expired");
                }
            } catch (error) {
                logger.error({ err: error }, 'Error occurred while updating expired orders');
            } finally {
                currentRun = undefined;
            }
        })();
    };

    runWorker(); // Run immediately on startup

    const timer = setInterval(runWorker, POLL_INTERVAL_MS);
    timer.unref(); // Allow the process to exit if this is the only active timer

    return async () => {
        stopped = true;
        clearInterval(timer);
        await currentRun; // Wait for the current run to finish if it's still running
    };
}