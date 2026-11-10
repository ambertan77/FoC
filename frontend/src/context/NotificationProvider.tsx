import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
    type ReactNode,
} from "react";
import queryClient from "@/lib/queryClient";
import { getToken } from "@/utils/token";
import useAuth from "@/hooks/useAuth";
import {
    getNotifications,
    getUnreadNotificationCount,
    markAllNotificationsAsRead,
    markNotificationAsRead
} from "@/features/notification/services/notification.service";
import { connectSse } from "@/features/notification/services/sse";
import { ENDPOINTS } from "@/api/endpoints";
import type { Notification } from "@/features/notification/types/notification.types";

type Listener = (notification: Notification) => void;

interface NotificationContextValue {
    items: Notification[];
    unread: number;
    connected: boolean;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
    subscribe: (listener: Listener) => () => void;
}

interface State {
    items: Notification[];
    unread: number;
}

type Action =
    | { type: "load"; items: Notification[] }
    | { type: "add"; notification: Notification }
    | { type: "setUnread"; unread: number }
    | { type: "read"; id: string }
    | { type: "unread"; id: string }
    | { type: "readAll" }
    | { type: "reset" };

const bySequenceDescending = (
    first: Notification,
    second: Notification,
): number => second.seq - first.seq;

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case "load": {
            const loadedIds = new Set(
                action.items.map((notification) => notification.id),
            );

            const liveItems = state.items.filter(
                (notification) => !loadedIds.has(notification.id),
            );

            return {
                ...state,
                items: [...liveItems, ...action.items].sort(
                    bySequenceDescending,
                ),
            };
        }

        case "add":
            if (
                state.items.some(
                    (notification) =>
                        notification.id === action.notification.id,
                )
            ) {
                return state;
            }

            return {
                items: [action.notification, ...state.items].sort(
                    bySequenceDescending,
                ),
                unread:
                    state.unread +
                    (action.notification.readAt ? 0 : 1),
            };

        case "setUnread":
            return {
                ...state,
                unread: action.unread,
            };

        case "read": {
            const target = state.items.find(
                (notification) => notification.id === action.id,
            );

            if (!target || target.readAt) return state;

            return {
                items: state.items.map((notification) =>
                    notification.id === action.id
                        ? {
                            ...notification,
                            readAt: new Date().toISOString(),
                        }
                        : notification,
                ),
                unread: Math.max(0, state.unread - 1),
            };
        }

        case "unread": {
            const target = state.items.find(
                (notification) => notification.id === action.id,
            );

            if (!target || !target.readAt) return state;

            return {
                items: state.items.map((notification) =>
                    notification.id === action.id
                        ? {
                            ...notification,
                            readAt: null,
                        }
                        : notification,
                ),
                unread: state.unread + 1,
            };
        }

        case "readAll": {
            const now = new Date().toISOString();

            return {
                items: state.items.map((notification) => ({
                    ...notification,
                    readAt: notification.readAt ?? now,
                })),
                unread: 0,
            };
        }

        case "reset":
            return {
                items: [],
                unread: 0,
            };
    }
}

const NotificationContext =
    createContext<NotificationContextValue | null>(null);

export function NotificationProvider({
    children,
}: {
    children: ReactNode;
}) {
    const { isAuthenticated, sessionVersion } = useAuth();

    const [state, dispatch] = useReducer(reducer, {
        items: [],
        unread: 0,
    });
    const [connected, setConnected] = useState(false);

    const listeners = useRef(new Set<Listener>());
    const seenIds = useRef(new Set<string>());
    const itemsRef = useRef(state.items);

    itemsRef.current = state.items;

    const refreshUnread = useCallback(async () => {
        try {
            const unread = await getUnreadNotificationCount();
            dispatch({ type: "setUnread", unread });
        } catch {
            // The query/cache layer reports API failures elsewhere.
        }
    }, []);

    useEffect(() => {
        if (!isAuthenticated) {
            dispatch({ type: "reset" });
            seenIds.current.clear();
            setConnected(false);
            return;
        }

        const controller = new AbortController();

        const loadNotifications = async () => {
            try {
                const page = await getNotifications({ limit: 100 });

                page.items.forEach((notification) => {
                    seenIds.current.add(notification.id);
                });

                dispatch({
                    type: "load",
                    items: page.items,
                });
            } catch {
                // REST errors are handled by the existing API/query layer.
            }
        };

        const notificationApiBaseUrl =
            import.meta.env.VITE_NOTIFICATION_API_BASE_URL;

        if (!notificationApiBaseUrl) {
            throw new Error("VITE_NOTIFICATION_API_BASE_URL is not defined");
        }

        void connectSse({
            url: `${notificationApiBaseUrl}${ENDPOINTS.notification.stream}`,
            getToken,
            signal: controller.signal,

            onAuthError: () => {
                setConnected(false);
                window.dispatchEvent(new Event("auth:logout"));
            },

            onOpen: () => {
                setConnected(true);
                void loadNotifications();
            },

            onMessage: (message) => {
                let data: unknown;

                try {
                    data = JSON.parse(message.data);
                } catch {
                    console.warn("Invalid notification SSE payload");
                    return;
                }

                if (message.event === "ready") {
                    if (
                        typeof data === "object" &&
                        data !== null &&
                        "unread" in data &&
                        typeof data.unread === "number"
                    ) {
                        dispatch({
                            type: "setUnread",
                            unread: data.unread,
                        });
                    }

                    return;
                }

                if (message.event === "read") {
                    if (
                        typeof data === "object" &&
                        data !== null &&
                        "id" in data &&
                        typeof data.id === "string"
                    ) {
                        dispatch({
                            type: "read",
                            id: data.id,
                        });
                    }

                    return;
                }

                if (message.event === "read-all") {
                    dispatch({ type: "readAll" });
                    return;
                }

                if (message.event !== "notification") return;

                const notification = data as Notification;

                if (
                    !notification.id ||
                    seenIds.current.has(notification.id)
                ) {
                    return;
                }

                seenIds.current.add(notification.id);

                dispatch({
                    type: "add",
                    notification,
                });

                listeners.current.forEach((listener) => {
                    listener(notification);
                });
                
                void queryClient.invalidateQueries({
                    queryKey: ["orders"],
                });

                void queryClient.invalidateQueries({
                    queryKey: ["notifications"],
                });
            },
        });

        return () => {
            controller.abort();
            setConnected(false);
        };
    }, [isAuthenticated, sessionVersion]);

    const markRead = useCallback(async (id: string) => {
        const notification = itemsRef.current.find(
            (item) => item.id === id,
        );

        if (!notification || notification.readAt) return;

        dispatch({ type: "read", id });

        try {
            await markNotificationAsRead(id);
        } catch {
            dispatch({ type: "unread", id });
            throw new Error("Unable to mark notification as read");
        }
    }, []);

    const markAllRead = useCallback(async () => {
        dispatch({ type: "readAll" });

        try {
            await markAllNotificationsAsRead();
        } catch {
            await refreshUnread();
            throw new Error("Unable to mark notifications as read");
        }
    }, [refreshUnread]);

    const subscribe = useCallback((listener: Listener) => {
        listeners.current.add(listener);

        return () => {
            listeners.current.delete(listener);
        };
    }, []);

    const value = useMemo<NotificationContextValue>(
        () => ({
            items: state.items,
            unread: state.unread,
            connected,
            markRead,
            markAllRead,
            subscribe,
        }),
        [
            state.items,
            state.unread,
            connected,
            markRead,
            markAllRead,
            subscribe,
        ],
    );

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications(): NotificationContextValue {
    const context = useContext(NotificationContext);

    if (!context) {
        throw new Error(
            "useNotifications must be used inside NotificationProvider",
        );
    }

    return context;
}