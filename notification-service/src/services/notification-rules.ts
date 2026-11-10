// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6),  Claude Code (Claude Sonnet 5.5)
// Date: approx. 2026-11-09
// Scope: Generated the backend notification service, including notification rules, event processing, persistence, unread counts, read-state updates, and SSE replay support.
// Author review: Reviewed, tested, and edited by Ng See Pui.


import type { OrderStatusEvent } from "../schemas/order-status-event.schema.js";

export interface Draft {
    userId: string;
    title: string;
    body: string;
}

/**
 * Who is told what for each transition. Wording lives here, so changing a
 * message never touches Order Service. Returns [] for transitions nobody needs.
 */
export function draftsFor(e: OrderStatusEvent): Draft[] {
    const requester = (title: string, body: string): Draft => ({ userId: e.requesterId, title, body });
    const courier = (title: string, body: string): Draft[] =>
        e.courierId ? [{ userId: e.courierId, title, body }] : [];
    const name = e.orderName;

    switch (e.toStatus) {
        case "OPEN":
            return [requester(
                e.fromStatus === "ACCEPTED" ? "Courier dropped your request" : "Your request is live",
                e.fromStatus === "ACCEPTED"
                    ? `"${name}" is open again for couriers.`
                    : `"${name}" is now open for couriers.`,
            )];
        case "RESERVATION_FAILED":
            return [requester("Request not created", `We could not reserve credits for "${name}".`)];
        case "ACCEPTED":
            return [requester("A courier accepted your request", `"${name}" has a courier.`)];
        case "PICKED_UP":
            return [requester("Item picked up", `Your courier picked up "${name}".`)];
        case "COMPLETED":
            return [requester("Delivered", `"${name}" was delivered. Please confirm receipt.`)];
        case "RECEIVED":
            return courier("Request received", `"${name}" was received.`);
        case "AUTO_RECEIVED":
            return [requester("Request auto received", `"${name}" was received.`),
                ...courier("Request auto received", `"${name}" was received.`),
            ];
        case "CANCELED":
        case "EXPIRED":
            return [requester("Request expired", `Nobody accepted "${name}" in time. You can renew it.`)];
        case "AUTO_FAILED":
            return [
                requester("Completion deadline missed", `"${name}" failed.`),
                ...courier("Completion deadline missed", `"${name}" was not completed in time.`),
            ];
        case "FAILED":
            return courier("Delivery reported as failed", `The requester reported "${name}" as failed.`);
        default:
            return [];
    }
}
