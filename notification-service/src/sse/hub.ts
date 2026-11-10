// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6),  Claude Code (Claude Sonnet 5.5)
// Date: approx. 2026-11-09
// Scope: Generated the backend notification service, including notification rules, event processing, persistence, unread counts, read-state updates, and SSE replay support.
// Author review: Reviewed, tested, and edited by Ng See Pui.


import type { Response } from "express";
import config from "../config/config.js";

// Data sent to the client for a new notification.
export interface PushPayload {
    seq: number; // notification seq, used for Last-Event-ID
    id: string; // notification id
    orderId: string;
    type: string; // order new status
    title: string; // notification title
    body: string; // notification body
    data: unknown;
    createdAt: Date | string;
}

/**
 * In-memory map of userId -> ALL of that user's open SSE connections.
 * Single-instance by design: with several replicas, a user's streams sit on one
 * replica but a competing consumer delivers each event to only one. See README.
 */
class SseHub {
    /*
   * Stores every active response connection.
   * Example:
   * user-1 -> [browserTab1Response, browserTab2Response]
   * user-2 -> [browserTab1Response]
   */
    private clients = new Map<string, Set<Response>>();

    // Register a new SSE connection for a user. Returns a function to unregister it.
    add(userId: string, res: Response): () => void {
        let set = this.clients.get(userId);
        if (!set) {
            this.clients.set(userId, (set = new Set()));
        }

        // Over the cap: close the oldest stream (a Set iterates in insertion order)
        while (set.size >= config.maxStreamsPerUser) {
            const oldest = set.values().next().value as Response;
            set.delete(oldest);
            oldest.end();
        }

        set.add(res);
        return () => {
            set.delete(res);
            if (set.size === 0 && this.clients.get(userId) === set) {
                this.clients.delete(userId);
            }
        };
    }

    // Writes one SSE frame. `id` is the notification seq, so Last-Event-ID can replay.
    send(res: Response, event: string, payload: unknown, id?: number): void {
        // The ID allows the browser to tell the server where it stopped.
        if (id !== undefined) {
            res.write(`id: ${id}\n`);
        }

        // Event name handled by the frontend SSE client.
        res.write(`event: ${event}\n`);

        // SSE data must be sent as text, so the object is converted to JSON.
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    /** 
     * A new notification: delivered to every open tab of the user. 
     * This updates all browser tabs and devices for that user.
    */
    push(userId: string, payload: PushPayload): void {
        for (const res of this.clients.get(userId) ?? []) {
            this.send(res, "notification", payload, payload.seq);
        }
    }

    /** 
     * Sends a custom event to every connection of a user.
     *
     * This can be used for events such as:
     * - ready
     * - unread-count
     * - read
     * - read-all
     */
    sendToUser(userId: string, event: string, payload: unknown, id?: number): void {
        for (const res of this.clients.get(userId) ?? []) {
            this.send(res, event, payload, id);
        }
    }

    /**
     * State-sync events (e.g. "read", "read-all") for every open tab of the user.
     * Sent WITHOUT an id so they never move a tab's Last-Event-ID cursor.
     */
    broadcast(userId: string, event: string, payload: unknown): void {
        for (const res of this.clients.get(userId) ?? []) {
            this.send(res, event, payload);
        }
    }

    startHeartbeat(): NodeJS.Timeout {
        const timer = setInterval(() => {
            for (const connections of this.clients.values()) {
                for (const res of connections) {
                    res.write(": ping\n\n");
                }
            }
        }, config.heartbeatMs);

        timer.unref();
        return timer;
    }

    // Closes all connections and clears the hub. Used for graceful shutdown.
    closeAll(): void {
        for (const connections of this.clients.values()) {
            for (const res of connections) {
                res.end();
            }
        }
        this.clients.clear();
    }

    // Returns the total number of open SSE connections across all users.
    get connections(): number {
        let total = 0;

        for (const connections of this.clients.values()) {
            total += connections.size;
        }

        return total;
    }

    // Returns the number of open SSE connections for a specific user.
    connectionsOf(userId: string): number {
        return this.clients.get(userId)?.size ?? 0;
    }
}

export const hub = new SseHub();
