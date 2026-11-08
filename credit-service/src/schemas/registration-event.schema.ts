// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-10-12
// Scope: Generated the strict Zod schema for USER_REGISTERED events consumed from RabbitMQ.
// Author review: Reviewed, tested, and edited by Lim Shao Qi.

import { z } from "zod";

export const registrationEventSchema = z.strictObject({
    eventId: z.uuid(),
    eventType: z.literal("USER_REGISTERED"),
    eventVersion: z.literal(1),
    occurredAt: z.iso.datetime(),
    userId: z.uuid(),
    role: z.literal("STUDENT"),
});
