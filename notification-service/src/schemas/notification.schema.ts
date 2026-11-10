import { z } from "zod";

export const listQuerySchema = z.object({
    unread: z.enum(["true", "false"]).default("false"),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.coerce.number().int().positive().optional(),
});

export const idParamSchema = z.object({ notificationId: z.uuid() });