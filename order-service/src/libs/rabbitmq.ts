import { OrderEventType } from "../generated/prisma/client.js";
import { connect, type Channel, type ChannelModel, type ConfirmChannel, type Options } from "amqplib";
import config from "../config/config.js";

const BROKER_TIMEOUT_MS = 10_000; // 10 seconds

type TopologyDeclarer = (channel: Channel) => Promise<void>;

const quorumQueueOptions = {
    durable: true,
    autoDelete: false,
    arguments: {
        "x-queue-type": "quorum",
        "x-delivery-limit": -1,
        "x-overflow": "reject-publish",
    },
} as const;

/** Declares: main queue (bound to the exchange), retry queue, dead queue. */
async function declareConsumerTopology(
    channel: Channel,
    t: {
        exchange: string;
        exchangeType: "direct" | "topic";
        bindingKeys: readonly string[];
        queue: string;
        retryQueue: string;
        deadQueue: string;
        retryDelayMs: number;
    },
): Promise<void> {
    await channel.assertExchange(t.exchange, t.exchangeType, {
        durable: true,
        autoDelete: false,
    });

    await channel.assertQueue(t.queue, quorumQueueOptions);
    for (const key of t.bindingKeys) {
        await channel.bindQueue(t.queue, t.exchange, key);
    }

    await channel.assertQueue(t.deadQueue, quorumQueueOptions);

    // Retry goes through the default exchange straight back to the main queue,
    // so no other queue bound to the exchange receives a duplicate.
    await channel.assertQueue(t.retryQueue, {
        ...quorumQueueOptions,
        arguments: {
            ...quorumQueueOptions.arguments,
            "x-message-ttl": t.retryDelayMs,
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": t.queue,
            "x-dead-letter-strategy": "at-least-once",
        },
    });
}

// ---------- Topologies Credit consumes (Order publishes to them) ----------
// Keep identical to credit-service. Order declares them too, so a mandatory
// publish never fails because Credit has not started yet.
export const RESERVATION_REQUEST_MESSAGING = {
    exchange: "credit.commands",
    exchangeType: "direct",
    routingKeys: {
        CREDIT_RESERVATION_REQUEST: "credit.reserve.v1",
    },
    bindingKeys: ["credit.reserve.v1"],
    queue: "credit.reserve.v1",
    retryQueue: "credit.reserve.retry.v1",
    deadQueue: "credit.reserve.dead.v1",
    retryDelayMs: 10_000,
} as const;

export const SETTLEMENT_MESSAGING = {
    exchange: "order.events",
    exchangeType: "topic",
    routingKeys: {
        ORDER_RECEIVED: "order.received.v1",
        ORDER_FAILED: "order.failed.v1",
        ORDER_CANCELED: "order.canceled.v1",
        ORDER_EXPIRED: "order.expired.v1",
    },
    bindingKeys: ["order.*.v1"],
    queue: "credit.order-events.v1",
    retryQueue: "credit.order-events.retry.v1",
    deadQueue: "credit.order-events.dead.v1",
    retryDelayMs: 10_000,
} as const;

// ---------- Topology Order consumes (Credit publishes to it) ----------
export const RESERVATION_RESULT_MESSAGING = {
    exchange: "credit.events",
    exchangeType: "topic",
    routingKeys: {
        CREDIT_RESERVATION_SUCCEEDED: "credit.reservation.succeeded.v1",
        CREDIT_RESERVATION_FAILED: "credit.reservation.failed.v1",
    },
    bindingKeys: ["credit.reservation.*.v1"],
    queue: "order.credit-events.v1",
    retryQueue: "order.credit-events.retry.v1",
    deadQueue: "order.credit-events.dead.v1",
    retryDelayMs: 10_000,
} as const;


export const declareReservationRequestTopology = (channel: Channel) =>
    declareConsumerTopology(channel, RESERVATION_REQUEST_MESSAGING);

export const declareSettlementTopology = (channel: Channel) =>
    declareConsumerTopology(channel, SETTLEMENT_MESSAGING);

export const declareReservationResultTopology = (channel: Channel) =>
    declareConsumerTopology(channel, RESERVATION_RESULT_MESSAGING);

/** Everything the outbox publisher sends to: the request command and ORDER_* events. */
export async function declareOrderPublishingTopology(channel: Channel): Promise<void> {
    await declareReservationRequestTopology(channel);
    await declareSettlementTopology(channel);
}


// ---------- Which exchange + routing key each outbox event uses ----------
export type PublishableOrderEventType = Extract<
    OrderEventType,
    | "CREDIT_RESERVATION_REQUEST"
    | "ORDER_RECEIVED"
    | "ORDER_CANCELED"
    | "ORDER_EXPIRED"
    | "ORDER_FAILED"
>;

export const ORDER_PUBLISH_ROUTES = {
    [OrderEventType.CREDIT_RESERVATION_REQUEST]: {
        exchange: RESERVATION_REQUEST_MESSAGING.exchange,
        routingKey: RESERVATION_REQUEST_MESSAGING.routingKeys.CREDIT_RESERVATION_REQUEST,
    },
    [OrderEventType.ORDER_RECEIVED]: {
        exchange: SETTLEMENT_MESSAGING.exchange,
        routingKey: SETTLEMENT_MESSAGING.routingKeys.ORDER_RECEIVED,
    },
    [OrderEventType.ORDER_CANCELED]: {
        exchange: SETTLEMENT_MESSAGING.exchange,
        routingKey: SETTLEMENT_MESSAGING.routingKeys.ORDER_CANCELED,
    },
    [OrderEventType.ORDER_EXPIRED]: {
        exchange: SETTLEMENT_MESSAGING.exchange,
        routingKey: SETTLEMENT_MESSAGING.routingKeys.ORDER_EXPIRED,
    },
    [OrderEventType.ORDER_FAILED]: {
        exchange: SETTLEMENT_MESSAGING.exchange,
        routingKey: SETTLEMENT_MESSAGING.routingKeys.ORDER_FAILED,
    },
} satisfies Record<PublishableOrderEventType, { exchange: string; routingKey: string }>;


// ---------- Connection helpers ----------
export async function connectOrderMessaging(
    declareTopology: TopologyDeclarer = declareOrderPublishingTopology,
): Promise<{ connection: ChannelModel; channel: ConfirmChannel }> {
    const value = config.rabbitmqUrl;
    let url: URL;
    try {
        url = new URL(value);
        if (url.protocol !== "amqp:" && url.protocol !== "amqps:") {
            throw new Error();
        }
    } catch {
        throw new Error("RABBITMQ_URL must be an amqp:// or amqps:// URL");
    }

    if (!url.searchParams.has("heartbeat")) {
        url.searchParams.set("heartbeat", "20");
    }

    const connection = await connect(url.toString(), {
        timeout: BROKER_TIMEOUT_MS
    });

    // Handle EventEmitter errors even between operations; never log URL credentials.
    connection.on("error", () =>
        console.warn("RabbitMQ connection error; reconnect required")
    );

    try {
        // Create a confirm channel for publishing messages with publisher confirms.
        const channel = await connection.createConfirmChannel();
        channel.on("error", () =>
            console.warn("RabbitMQ channel error; reconnect required")
        );

        // Assert the exchange for order events.
        await declareTopology(channel);
        return { connection, channel };
    } catch (error) {
        await connection.close().catch(() => undefined);
        throw error;
    }
};


export function connectReservationResultMessaging() {
    return connectOrderMessaging(declareReservationResultTopology);
}

const publishingChannels = new WeakSet<ConfirmChannel>();
const failedChannels = new WeakSet<ConfirmChannel>();

export async function publishConfirmed(
    channel: ConfirmChannel,
    exchange: string,
    routingKey: string,
    content: Buffer,
    properties: Options.Publish = {},
): Promise<void> {
    if (failedChannels.has(channel)) {
        throw new Error("Reconnect before publishing again")
    };

    if (publishingChannels.has(channel)) {
        throw new Error("Concurrent publishes are not supported");
    }

    publishingChannels.add(channel);
    return new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            channel.off("return", onReturn);
            channel.off("error", onError);
            channel.off("close", onClose);
            publishingChannels.delete(channel);

            if (error) {
                failedChannels.add(channel);
                // Prevent late confirms/returns from being mistaken for a new publish.
                void channel.close().catch(() => undefined);
                reject(error);
            } else {
                resolve();
            }
        };

        const onReturn = () => finish(new Error("RabbitMQ returned an unroutable message"));
        const onError = () => finish(new Error("RabbitMQ channel failed during publication"));
        const onClose = () => finish(new Error("RabbitMQ channel closed before confirmation"));
        const timer = setTimeout(
            () => finish(new Error("RabbitMQ publisher confirmation timed out")),
            BROKER_TIMEOUT_MS,
        );

        channel.on("return", onReturn);
        channel.on("error", onError);
        channel.on("close", onClose);

        try {
            // A false publish return is backpressure, not a negative confirmation.
            // Sequential callers wait here for broker confirmation before continuing.
            channel.publish(exchange, routingKey, content, {
                contentType: "application/json",
                ...properties,
                persistent: true,
                deliveryMode: 2,
                mandatory: true,
            }, (error) => {
                finish(error ? new Error("RabbitMQ did not confirm publication") : undefined);
            });
        } catch {
            finish(new Error("RabbitMQ publication failed"));
        }
    });
}

export function publishOrderEvent(
    channel: ConfirmChannel,
    eventType: PublishableOrderEventType,
    content: Buffer,
    properties: Options.Publish = {},
): Promise<void> {
    const route = ORDER_PUBLISH_ROUTES[eventType];
    return publishConfirmed(channel, route.exchange, route.routingKey, content, properties);
}