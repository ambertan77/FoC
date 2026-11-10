import { useState } from "react";
import { Bell, Circle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useNotifications } from "@/context/NotificationProvider";
import type { Notification } from "@/features/notification/types/notification.types";
import { Spinner } from "@/components/ui/spinner";


function timeAgo(iso: string): string {
    const seconds = Math.max(
        0,
        (Date.now() - new Date(iso).getTime()) / 1000,
    );

    if (seconds < 60) return "just now";
    if (seconds < 3_600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3_600)} h ago`;

    return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
    const {
        items,
        unread,
        connected,
        markRead,
        markAllRead,
    } = useNotifications();

    const [open, setOpen] = useState(false);

    const handleNotificationClick = async (
        notification: Notification,
    ): Promise<void> => {
        await markRead(notification.id);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="relative"
                        aria-label={`Notifications, ${unread} unread`}
                    />
                }
            >
                <Bell className="size-6 md:size-5" />

                {unread > 0 && (
                    <Badge
                        variant="notification"
                        className="absolute -top-1.5 -right-1.5 min-w-5 justify-center rounded-full text-[10px]"
                    >
                        {unread > 99 ? "99+" : unread}
                    </Badge>
                )}

                <Circle
                    className={
                        connected
                            ? "absolute right-1 bottom-1 size-2 fill-green-400 text-green-400"
                            : "absolute right-1 bottom-1 size-2 fill-gray-400 text-gray-400 animate-pulse"
                    }
                    aria-label={connected ? "Connected" : "Reconnecting"}
                />
            </PopoverTrigger>

            <PopoverContent
                align="end"
                side="bottom"
                sideOffset={8}
                className="w-[calc(100vw-2rem)] max-w-96 p-0 sm:w-96"
            >
                <PopoverHeader className="flex-row items-center justify-between px-4 pt-4">
                    <PopoverTitle className="text-base font-semibold">
                        Notifications
                    </PopoverTitle>
                    <Button
                        type="button"
                        variant="indigo200"
                        size="sm"
                        disabled={unread === 0}
                        onClick={() => {
                            void markAllRead();
                        }}
                    >
                        Mark all as read
                    </Button>
                </PopoverHeader>

                {!connected ? (
                    <div className="flex w-full flex-1 items-center justify-center gap-2 p-6 text-muted-foreground">
                        <Spinner className="size-5" />
                        <span>Connecting to notifications...</span>
                    </div>
                ) : items.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">
                        You are all caught up.
                    </p>
                ) : (
                    <ScrollArea className="h-96">
                        <div className="divide-y">
                            {items.map((notification) => {
                                const isUnread = !notification.readAt;

                                return (
                                    <button
                                        key={notification.id}
                                        type="button"
                                        className={`
                                        flex w-full flex-col gap-0.5 px-4 py-2 text-left transition-colors
                                        ${isUnread
                                                ? "bg-indigo-50/60 hover:bg-indigo-50 cursor-pointer"
                                                : "bg-transparent"}
                                    `}
                                        onClick={() => {
                                            void handleNotificationClick(
                                                notification,
                                            );
                                        }}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <span
                                                className={
                                                    isUnread
                                                        ? "font-semibold text-foreground"
                                                        : "font-medium text-foreground"
                                                }
                                            >
                                                {notification.title}
                                            </span>

                                            {!notification.readAt && (
                                                <span className="mt-2 size-2 shrink-0 rounded-full bg-indigo-600" />
                                            )}
                                        </div>

                                        <span className="line-clamp-2 text-sm text-muted-foreground">
                                            {notification.body}
                                        </span>

                                        <span className="text-xs text-muted-foreground">
                                            {timeAgo(notification.createdAt)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollArea>
                )}
            </PopoverContent>
        </Popover>
    );
}