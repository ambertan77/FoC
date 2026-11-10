// AI Assistance Disclosure:
// Tool: Claude Code (Opus 5.5)
// Date: 2026-11-03
// Scope: Add enabled boolean to the useQuery functions so that hooks run conditionally
// Author review: Reviewed, tested, and edited by Amber Tan Junning.

import { useQuery } from "@tanstack/react-query";
import { getUserByIdService } from "../services/order.requester.service";
import type { Order, ViewerRole } from "../types/order.types";

export function useOrderRequesterDetails(order: Order, viewerRole: ViewerRole, enabled: boolean) {
    return useQuery({
        queryKey: ["orders", "related-user", "courier", viewerRole, order.requesterId],
        enabled: enabled && Boolean(order.requesterId),
        queryFn: () => getUserByIdService(order.requesterId),
    })
}

export function useOrderCourierDetails(order: Order, viewerRole: ViewerRole, enabled: boolean) {
    return useQuery({
        queryKey: ["orders", "related-user", "requester", viewerRole, order.courierId],
        enabled: enabled && Boolean(order.courierId),
        queryFn: () => getUserByIdService(order.courierId!),
    })
}
