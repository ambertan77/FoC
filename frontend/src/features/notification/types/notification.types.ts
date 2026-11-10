export interface NotificationData {
    orderId: string;
    fromStatus: string | null;
    toStatus: string;
    version: number;
    occurredAt: string;
}

export interface Notification {
    id: string;
    seq: number;
    orderId: string;
    type: string;
    title: string;
    body: string;
    data: NotificationData;
    readAt: string | null;
    createdAt: string;
}

export interface UnreadCountData {
    unread: number;
}

export interface NotificationListData {
    items: Notification[];
    nextCursor: number | null;
}