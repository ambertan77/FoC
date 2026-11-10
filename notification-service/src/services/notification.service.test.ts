import test from "node:test";
import assert from "node:assert/strict";
import { mock, type TestContext } from "node:test";

import { prisma as sharedPrisma } from "../libs/prisma.js";
import {
    countUnread,
    handleOrderStatusEvent,
    listNotifications,
    markAllRead,
    markRead,
    missedSince,
    toPayload,
} from "./notification.service.js";

const ids = {
    eventId: "33333333-3333-4333-8333-333333333333",
    orderId: "11111111-1111-4111-8111-111111111111",
    requesterId: "22222222-2222-4222-8222-222222222222",
    courierId: "44444444-4444-4444-8444-444444444444",
};

const baseEvent = {
    eventId: ids.eventId,
    eventType: "ORDER_STATUS_CHANGED" as const,
    orderId: ids.orderId,
    orderName: "Buy coffee",
    requesterId: ids.requesterId,
    courierId: ids.courierId,
    fromStatus: "OPEN" as const,
    toStatus: "ACCEPTED" as const,
    version: 2,
    offeredCredits: 10,
    occurredAt: "2026-11-10T00:00:00.000Z",
};

const notification = {
    seq: 10,
    id: "55555555-5555-4555-8555-555555555555",
    userId: ids.requesterId,
    orderId: ids.orderId,
    eventId: ids.eventId,
    type: "ACCEPTED",
    title: "A courier accepted your request",
    body: '"Buy coffee" has a courier.',
    data: {
        orderId: ids.orderId,
        fromStatus: "OPEN",
        toStatus: "ACCEPTED",
        version: 2,
        occurredAt: baseEvent.occurredAt,
    },
    readAt: null,
    createdAt: new Date("2026-11-10T00:00:00.000Z"),
};

interface MockConfig {
    processedEventCount?: number;
    createdNotifications?: unknown[];
    notificationRows?: unknown[];
    unreadCount?: number;
    updatedCount?: number;
}

function createMockPrisma(config: MockConfig = {}) {
    const calls = {
        transaction: 0,
        processedEventCreateMany: 0,
        notificationCreateManyAndReturn: 0,
        notificationFindMany: 0,
        notificationCount: 0,
        notificationUpdateMany: 0,
    };

    const captured = {
        processedEventCreateManyArgs: undefined as unknown,
        notificationCreateManyAndReturnArgs: undefined as unknown,
        notificationFindManyArgs: undefined as unknown,
        notificationCountArgs: undefined as unknown,
        notificationUpdateManyArgs: [] as unknown[],
    };

    const prisma = {
        processedEvent: {
            createMany: mock.fn(async (args: unknown) => {
                calls.processedEventCreateMany++;
                captured.processedEventCreateManyArgs = args;

                return {
                    count: config.processedEventCount ?? 1,
                };
            }),
        },

        notification: {
            createManyAndReturn: mock.fn(async (args: unknown) => {
                calls.notificationCreateManyAndReturn++;
                captured.notificationCreateManyAndReturnArgs = args;

                return config.createdNotifications ?? [];
            }),

            findMany: mock.fn(async (args: unknown) => {
                calls.notificationFindMany++;
                captured.notificationFindManyArgs = args;

                return config.notificationRows ?? [];
            }),

            count: mock.fn(async (args: unknown) => {
                calls.notificationCount++;
                captured.notificationCountArgs = args;

                return config.unreadCount ?? 0;
            }),

            updateMany: mock.fn(async (args: unknown) => {
                calls.notificationUpdateMany++;
                captured.notificationUpdateManyArgs.push(args);

                return {
                    count: config.updatedCount ?? 1,
                };
            }),
        },

        $transaction: mock.fn(async (
            callback: (tx: unknown) => Promise<unknown>,
        ) => {
            calls.transaction++;
            return callback(prisma);
        }),
    };

    return { prisma, calls, captured };
}

function useSharedMockPrisma(
    t: TestContext,
    config: MockConfig = {},
) {
    const mocked = createMockPrisma(config);

    const originalProcessedEvent = sharedPrisma.processedEvent;
    const originalNotification = sharedPrisma.notification;
    const originalTransaction = sharedPrisma.$transaction;

    Object.defineProperty(sharedPrisma, "processedEvent", {
        value: mocked.prisma.processedEvent,
        configurable: true,
        writable: true,
    });

    Object.defineProperty(sharedPrisma, "notification", {
        value: mocked.prisma.notification,
        configurable: true,
        writable: true,
    });

    Object.defineProperty(sharedPrisma, "$transaction", {
        value: mocked.prisma.$transaction,
        configurable: true,
        writable: true,
    });

    t.after(() => {
        Object.defineProperty(sharedPrisma, "processedEvent", {
            value: originalProcessedEvent,
            configurable: true,
            writable: true,
        });

        Object.defineProperty(sharedPrisma, "notification", {
            value: originalNotification,
            configurable: true,
            writable: true,
        });

        Object.defineProperty(sharedPrisma, "$transaction", {
            value: originalTransaction,
            configurable: true,
            writable: true,
        });
    });

    return mocked;
}

test("handleOrderStatusEvent creates and returns notifications for a new event", async (t) => {
    const createdNotification = {
        ...notification,
        userId: ids.requesterId,
    };

    const { calls, captured } = useSharedMockPrisma(t, {
        createdNotifications: [createdNotification],
    });

    const result = await handleOrderStatusEvent(baseEvent);

    assert.equal(result, 1);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.processedEventCreateMany, 1);
    assert.equal(calls.notificationCreateManyAndReturn, 1);

    assert.deepEqual(captured.processedEventCreateManyArgs, {
        data: [{ eventId: baseEvent.eventId }],
        skipDuplicates: true,
    });

    const createArgs = captured.notificationCreateManyAndReturnArgs as {
        data: Array<Record<string, unknown>>;
        skipDuplicates: boolean;
    };

    assert.equal(createArgs.skipDuplicates, true);
    assert.equal(createArgs.data.length, 1);
    assert.equal(createArgs.data[0]?.userId, ids.requesterId);
    assert.equal(createArgs.data[0]?.orderId, ids.orderId);
    assert.equal(createArgs.data[0]?.eventId, ids.eventId);
    assert.equal(createArgs.data[0]?.type, "ACCEPTED");
    assert.equal(createArgs.data[0]?.title, "A courier accepted your request");
    assert.equal(createArgs.data[0]?.body, '"Buy coffee" has a courier.');

    assert.deepEqual(createArgs.data[0]?.data, {
        orderId: ids.orderId,
        fromStatus: "OPEN",
        toStatus: "ACCEPTED",
        version: 2,
        occurredAt: baseEvent.occurredAt,
    });
});

test("handleOrderStatusEvent ignores duplicate events", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        processedEventCount: 0,
    });

    const result = await handleOrderStatusEvent(baseEvent);

    assert.equal(result, 0);
    assert.equal(calls.transaction, 1);
    assert.equal(calls.processedEventCreateMany, 1);
    assert.equal(calls.notificationCreateManyAndReturn, 0);
    assert.equal(captured.notificationCreateManyAndReturnArgs, undefined);
});

test("handleOrderStatusEvent does not create notifications for unsupported transitions", async (t) => {
    const event = {
        ...baseEvent,
        toStatus: "PENDING_RESERVATION" as const,
    };

    const { calls } = useSharedMockPrisma(t);

    const result = await handleOrderStatusEvent(event);

    assert.equal(result, 0);
    assert.equal(calls.processedEventCreateMany, 1);
    assert.equal(calls.notificationCreateManyAndReturn, 0);
});

test("handleOrderStatusEvent creates notifications for requester and courier", async (t) => {
    const event = {
        ...baseEvent,
        fromStatus: "COMPLETED" as const,
        toStatus: "AUTO_RECEIVED" as const,
    };

    const createdNotifications = [
        { ...notification, userId: ids.requesterId },
        {
            ...notification,
            id: "66666666-6666-4666-8666-666666666666",
            seq: 11,
            userId: ids.courierId,
            type: "AUTO_RECEIVED",
        },
    ];

    const { calls, captured } = useSharedMockPrisma(t, {
        createdNotifications,
    });

    const result = await handleOrderStatusEvent(event);

    assert.equal(result, 2);
    assert.equal(calls.notificationCreateManyAndReturn, 1);

    const createArgs = captured.notificationCreateManyAndReturnArgs as {
        data: Array<Record<string, unknown>>;
    };

    assert.equal(createArgs.data.length, 2);
    assert.equal(createArgs.data[0]?.userId, ids.requesterId);
    assert.equal(createArgs.data[1]?.userId, ids.courierId);
});

test("listNotifications returns a page and next cursor when more rows exist", async (t) => {
    const rows = [
        { ...notification, seq: 20 },
        { ...notification, seq: 19 },
        { ...notification, seq: 18 },
    ];

    const { calls, captured } = useSharedMockPrisma(t, {
        notificationRows: rows,
    });

    const result = await listNotifications(ids.requesterId, {
        unreadOnly: false,
        limit: 2,
        beforeSeq: undefined,
    });

    assert.deepEqual(result, {
        items: rows.slice(0, 2),
        nextCursor: 19,
    });

    assert.equal(calls.notificationFindMany, 1);

    assert.deepEqual(captured.notificationFindManyArgs, {
        where: {
            userId: ids.requesterId,
        },
        orderBy: { seq: "desc" },
        take: 3,
    });
});

test("listNotifications filters unread notifications and uses beforeSeq", async (t) => {
    const { captured } = useSharedMockPrisma(t, {
        notificationRows: [notification],
    });

    await listNotifications(ids.requesterId, {
        unreadOnly: true,
        limit: 20,
        beforeSeq: 50,
    });

    assert.deepEqual(captured.notificationFindManyArgs, {
        where: {
            userId: ids.requesterId,
            readAt: null,
            seq: { lt: 50 },
        },
        orderBy: { seq: "desc" },
        take: 21,
    });
});

test("listNotifications returns null nextCursor when there are no more rows", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        notificationRows: [notification],
    });

    const result = await listNotifications(ids.requesterId, {
        unreadOnly: false,
        limit: 20,
        beforeSeq: undefined,
    });

    assert.deepEqual(result, {
        items: [notification],
        nextCursor: null,
    });

    assert.equal(calls.notificationFindMany, 1);
});

test("countUnread counts unread notifications for a user", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        unreadCount: 4,
    });

    const result = await countUnread(ids.requesterId);

    assert.equal(result, 4);
    assert.equal(calls.notificationCount, 1);

    assert.deepEqual(captured.notificationCountArgs, {
        where: {
            userId: ids.requesterId,
            readAt: null,
        },
    });
});

test("markRead updates only the user's unread notification", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        updatedCount: 1,
    });

    const result = await markRead(ids.requesterId, notification.id);

    assert.equal(result, 1);
    assert.equal(calls.notificationUpdateMany, 1);

    const args = captured.notificationUpdateManyArgs[0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
    };

    assert.deepEqual(args.where, {
        id: notification.id,
        userId: ids.requesterId,
        readAt: null,
    });

    assert.ok(args.data.readAt instanceof Date);
});

test("markRead returns zero when no notification was updated", async (t) => {
    const { calls } = useSharedMockPrisma(t, {
        updatedCount: 0,
    });

    const result = await markRead(ids.requesterId, notification.id);

    assert.equal(result, 0);
    assert.equal(calls.notificationUpdateMany, 1);
});

test("markAllRead marks all unread notifications for the user", async (t) => {
    const { calls, captured } = useSharedMockPrisma(t, {
        updatedCount: 3,
    });

    const result = await markAllRead(ids.requesterId);

    assert.equal(result, 3);
    assert.equal(calls.notificationUpdateMany, 1);

    const args = captured.notificationUpdateManyArgs[0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
    };

    assert.deepEqual(args.where, {
        userId: ids.requesterId,
        readAt: null,
    });

    assert.ok(args.data.readAt instanceof Date);
});

test("missedSince returns notifications after the supplied sequence", async (t) => {
    const rows = [
        { ...notification, seq: 11 },
        { ...notification, seq: 12 },
    ];

    const { calls, captured } = useSharedMockPrisma(t, {
        notificationRows: rows,
    });

    const result = await missedSince(ids.requesterId, 10);

    assert.deepEqual(result, rows);
    assert.equal(calls.notificationFindMany, 1);

    assert.deepEqual(captured.notificationFindManyArgs, {
        where: {
            userId: ids.requesterId,
            seq: { gt: 10 },
        },
        orderBy: { seq: "asc" },
        take: 200,
    });
});

test("toPayload maps a notification to an SSE payload", () => {
    const payload = toPayload(notification);

    assert.deepEqual(payload, {
        seq: notification.seq,
        id: notification.id,
        orderId: notification.orderId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        createdAt: notification.createdAt,
    });
});