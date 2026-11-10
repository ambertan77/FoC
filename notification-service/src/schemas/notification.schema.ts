// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6),  Claude Code (Claude Sonnet 5.5)
// Date: approx. 2026-11-09
// Scope: Generated the backend notification service, including notification rules, event processing, persistence, unread counts, read-state updates, and SSE replay support.
// Author review: Reviewed, tested, and edited by Ng See Pui.

import { z } from "zod";

export const listQuerySchema = z.object({
    unread: z.enum(["true", "false"]).default("false"),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.coerce.number().int().positive().optional(),
});

export const idParamSchema = z.object({ notificationId: z.uuid() });