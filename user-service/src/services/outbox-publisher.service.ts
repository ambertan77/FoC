// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated the outbox polling loop (startOutboxPublisher) with exponential retryDelay capped at 60s, failureCode mapping and clean disconnect.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { setTimeout as delay } from "node:timers/promises";
import type { PrismaClient } from "../generated/prisma/client.js";
import {
  connectRegistrationMessaging,
  publishUserRegistered,
} from "../libs/rabbitmq.js";
import { logger } from "../libs/logger.js";

const POLL_INTERVAL_MS = 5_000; // 5 seconds between polls when no pending events are found.

function retryDelay(attempt: number): number {
  return Math.min(2 ** Math.min(Math.max(attempt - 1, 0), 6), 60) * 1_000;
}

// Avoid persisting/logging raw driver errors, which can contain credentials or
// query data. The operation and a bounded driver code identify the failure.
function failureCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error
    && typeof error.code === "string" && /^[A-Z][A-Z0-9_]{0,40}$/.test(error.code)) {
    return error.code;
  }
  return "UNKNOWN";
}

/**
 * Start one sequential publisher per user-service deployment. No broker call
 * runs inside a database transaction or blocks the HTTP startup callback.
 * The returned stop function wakes polling and waits for the current attempt.
 */
export function startOutboxPublisher(prisma: PrismaClient): () => Promise<void> {
  const abort = new AbortController();
  let session: Awaited<ReturnType<typeof connectRegistrationMessaging>> | undefined;

  async function pause(milliseconds: number): Promise<void> {
    try {
      await delay(milliseconds, undefined, { signal: abort.signal });
    } catch (error) {
      if (!abort.signal.aborted) throw error;
    }
  }

  async function disconnect(): Promise<void> {
    const previous = session;
    session = undefined;
    await previous?.connection.close().catch(() => undefined);
  }

  async function getSession() {
    if (!session) {
      const connected = await connectRegistrationMessaging();
      session = connected;
      connected.connection.once("close", () => {
        if (session === connected) session = undefined;
      });
      connected.channel.once("close", () => {
        if (session === connected) session = undefined;
        void connected.connection.close().catch(() => undefined);
      });
    }
    return session;
  }

  async function run(): Promise<void> {
    let consecutiveFailures = 0;
    try {
      while (!abort.signal.aborted) {
        try {
          const pending = await prisma.outboxEvent.findFirst({
            where: { publishedAt: null, nextAttemptAt: { lte: new Date() } },
            orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { eventId: "asc" }],
          });
          if (abort.signal.aborted) break;
          if (!pending) {
            await pause(POLL_INTERVAL_MS);
            continue;
          }

          // Persist the attempt before contacting RabbitMQ. A process crash
          // leaves the row unpublished and eligible again after this delay.
          const event = await prisma.outboxEvent.update({
            where: { eventId: pending.eventId, publishedAt: null },
            data: {
              attemptCount: { increment: 1 },
              nextAttemptAt: new Date(Date.now() + retryDelay(pending.attemptCount + 1)),
            },
          });
          const userId = typeof event.payload === "object" && event.payload !== null
            && !Array.isArray(event.payload) && typeof event.payload.userId === "string"
            ? event.payload.userId : null;
          const context = { eventId: event.eventId, userId, attempt: event.attemptCount };
          let operation = "CONNECT";
          try {
            const { channel } = await getSession();
            operation = "PUBLISH";
            await publishUserRegistered(
              channel,
              Buffer.from(JSON.stringify(event.payload)),
              { messageId: event.eventId },
            );
            operation = "MARK_PUBLISHED";
            await prisma.outboxEvent.update({
              where: { eventId: event.eventId, publishedAt: null },
              data: { publishedAt: new Date(), lastError: null },
            });
            consecutiveFailures = 0;
            logger.info({ ...context, outcome: "published" }, "Outbox publisher");
          } catch (error) {
            const lastError = `${operation}_FAILED:${failureCode(error)}`;
            logger.warn({ ...context, outcome: "retry_scheduled", error: lastError }, "Outbox publisher");
            await disconnect();
            // If marking published failed after confirmation, retry the same
            // event. Group 1 makes this possible duplicate safe.
            await prisma.outboxEvent.updateMany({
              where: { eventId: event.eventId, publishedAt: null },
              data: {
                nextAttemptAt: new Date(Date.now() + retryDelay(event.attemptCount)),
                lastError,
              },
            });
            consecutiveFailures++;
            await pause(retryDelay(consecutiveFailures));
          }
        } catch (error) {
          // Includes database outages while polling or saving retry metadata.
          // Rows remain durable; never let a worker failure stop registration.
          logger.warn({
            outcome: "worker_retry",
            error: failureCode(error),
          }, "Outbox publisher");
          consecutiveFailures++;
          await pause(retryDelay(consecutiveFailures));
        }
      }
    } finally {
      await disconnect();
    }
  }

  const completion = run();
  return async () => {
    abort.abort();
    await completion;
  };
}
