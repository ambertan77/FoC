// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6),  Claude Code (Claude Sonnet 5.5)
// Date: approx. 2026-11-09
// Scope: Generated the backend notification service, including notification rules, event processing, persistence, unread counts, read-state updates, and SSE replay support.
// Author review: Reviewed, tested, and edited by Ng See Pui.

import type { Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/errors.js";
import { hub } from "../sse/hub.js";
import {
    countUnread,
    listNotifications,
    markAllRead,
    markRead,
    missedSince,
    toPayload,
} from "../services/notification.service.js";
import type { AuthRequest } from "../types/auth.types.js";
import { idParamSchema, listQuerySchema } from "../schemas/notification.schema.js";

function currentUserId(req: AuthRequest): string {
    if (!req.user) {
        throw new AppError("Authentication required", 401);
    }

    return req.user.userId;
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
    const result = schema.safeParse(input);
    if (!result.success) {
        throw new AppError(result.error.issues.at(0)?.message || "Invalid query", 400);
    }

    return result.data;
}

/**
 * A reconnecting client sends Last-Event-ID, and anything created while it was
 * away is replayed from the database before live pushes continue.
 */
export async function streamNotifications(req: AuthRequest, res: Response): Promise<void> {
    const userId = currentUserId(req);

    res.status(200).set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // tell nginx not to buffer this response
    });
    res.flushHeaders();

    // Register before replaying so nothing slips between the query and the live push.
    const remove = hub.add(userId, res);
    req.on("close", remove);

    const last = Number(req.headers["last-event-id"]);
    if (Number.isSafeInteger(last) && last >= 0) {
        for (const n of await missedSince(userId, last)) {
            hub.send(res, "notification", toPayload(n), n.seq);
        }
    }
    hub.send(res, "ready", { unread: await countUnread(userId) });
}

export async function getNotifications(
    req: AuthRequest,
    res: Response,
): Promise<void> {
    const userId = currentUserId(req);
    const parsedQuery = parse(listQuerySchema, req.query);

    const page = await listNotifications(userId, {
        unreadOnly: parsedQuery.unread === "true",
        limit: parsedQuery.limit,
        beforeSeq: parsedQuery.cursor,
    });

    res.status(200).json({
        success: true,
        message: "Notifications retrieved successfully",
        data: page,
    });
}

export async function getUnreadCount(
    req: AuthRequest,
    res: Response,
): Promise<void> {
    const unread = await countUnread(currentUserId(req));

    res.status(200).json({
        success: true,
        message: "Unread notification count retrieved successfully",
        data: { unread },
    });
}

export async function readNotification(
    req: AuthRequest,
    res: Response,
): Promise<void> {
    const userId = currentUserId(req);
    const { notificationId } = parse(idParamSchema, req.params);

    const updated = await markRead(userId, notificationId.toLowerCase());

    if (updated === 0) {
        throw new AppError(
            "Notification not found",
            404,
            "NOTIFICATION_NOT_FOUND",
        );
    }

    // Keep the user's other tabs in sync
    hub.broadcast(userId, "read", { id: notificationId });

    res.status(200).json({
        success: true,
        message: "Notification marked as read",
        data: { id: notificationId },
    });
}

export async function readAllNotifications(
    req: AuthRequest,
    res: Response,
): Promise<void> {
    const userId = currentUserId(req);
    const updated = await markAllRead(userId);

    hub.broadcast(userId, "read-all", {});

    res.status(200).json({
        success: true,
        message: "All notifications marked as read",
        data: { updated },
    });
}
