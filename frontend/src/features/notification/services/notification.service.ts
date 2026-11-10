import { ENDPOINTS } from "@/api/endpoints";
import notificationApi from "@/api/notificationApi";
import type { ApiResponse } from "@/types/api.types";
import { parseError } from "@/utils/errorHandler";
import type { NotificationListData, UnreadCountData } from "../types/notification.types";

export async function getNotifications(params?: {
    unread?: boolean;
    limit?: number;
    cursor?: number;
}): Promise<NotificationListData> {
    try {

        const response = await notificationApi.get<
            ApiResponse<NotificationListData>
        >(ENDPOINTS.notification.list, {
            params: {
                ...(params?.unread !== undefined
                    ? { unread: String(params.unread) }
                    : {}),
                ...(params?.limit !== undefined ? { limit: params.limit } : {}),
                ...(params?.cursor !== undefined ? { cursor: params.cursor } : {}),
            },
        });

        return response.data.data!;
    } catch (error) {
        throw parseError(error);
    }
};

export async function getUnreadNotificationCount(): Promise<number> {
    try {
        const response = await notificationApi.get<
            ApiResponse<UnreadCountData>
        >(ENDPOINTS.notification.getUnreadCount);

        return response.data.data!.unread;
    } catch (error) {
        throw parseError(error);
    }
}

export async function markNotificationAsRead(
    notificationId: string,
): Promise<void> {
    try {
        await notificationApi.patch(
            ENDPOINTS.notification.markAsRead(notificationId),
        );
    } catch (error) {
        throw parseError(error);
    }
}

export async function markAllNotificationsAsRead(): Promise<number> {
    try {
        const response = await notificationApi.post(
            ENDPOINTS.notification.markAllAsRead,
        );

        return response.data.data?.updated ?? 0;

    } catch (error) {
        throw parseError(error);
    }
}