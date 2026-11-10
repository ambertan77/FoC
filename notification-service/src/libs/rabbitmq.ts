// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Replaced console.* with the pino logger.
// Author review: Reviewed, tested, checked by Duong Ngoc Mai.

import {
    connect,
    type Channel,
    type ChannelModel,
    type ConfirmChannel,
    type Options,
} from "amqplib";
import config from "../config/config.js";
import { logger } from "./logger.js";

const BROKER_TIMEOUT_MS = 10_000;

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
    await channel.assertExchange(t.exchange, t.exchangeType, { durable: true, autoDelete: false });

    await channel.assertQueue(t.queue, quorumQueueOptions);
    for (const key of t.bindingKeys) await channel.bindQueue(t.queue, t.exchange, key);

    await channel.assertQueue(t.deadQueue, quorumQueueOptions);

    // Retry goes through the default exchange straight back to the main queue.
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

// Order Service owns the exchange and publishes ORDER_STATUS_CHANGED to it.
// Keep this identical in order-service (it declares it too, so a mandatory
// publish is never returned as unroutable when this service is not up yet).
export const ORDER_STATUS_MESSAGING = {
    exchange: "order.events",
    exchangeType: "topic",
    routingKeys: {
        ORDER_STATUS_CHANGED: "order.status.changed.v1",
    },
    // Explicit binding, not "order.*.v1", so nothing else is ever delivered here.
    bindingKeys: ["order.status.changed.v1"],
    queue: "notification.order-events.v1",
    retryQueue: "notification.order-events.retry.v1",
    deadQueue: "notification.order-events.dead.v1",
    retryDelayMs: 10_000,
} as const;

export const declareOrderStatusTopology = (channel: Channel) =>
    declareConsumerTopology(channel, ORDER_STATUS_MESSAGING);

export async function connectMessaging(
    declareTopology: (channel: Channel) => Promise<void>,
): Promise<{ connection: ChannelModel; channel: ConfirmChannel }> {
    // Read lazily: missing broker configuration must not prevent HTTP startup.
    const value = config.rabbitmqUrl;
    if (!value) throw new Error("RABBITMQ_URL is not configured");
    let url: URL;
    try {
        url = new URL(value);
        if (url.protocol !== "amqp:" && url.protocol !== "amqps:") throw new Error();
    } catch {
        throw new Error("RABBITMQ_URL must be an amqp:// or amqps:// URL");
    }
    if (!url.searchParams.has("heartbeat")) url.searchParams.set("heartbeat", "20");

    const connection = await connect(url.toString(), { timeout: BROKER_TIMEOUT_MS });
    // Handle EventEmitter errors even between operations; never log URL credentials.
    connection.on("error", () => logger.warn("RabbitMQ connection error; reconnect required"));
    try {
        const channel = await connection.createConfirmChannel();
        channel.on("error", () => logger.warn("RabbitMQ channel error; reconnect required"));
        await declareTopology(channel);
        return { connection, channel };
    } catch (error) {
        await connection.close().catch(() => undefined);
        throw error;
    }
}

export const connectOrderStatusMessaging = () => connectMessaging(declareOrderStatusTopology);

const publishingChannels = new WeakSet<ConfirmChannel>();
const failedChannels = new WeakSet<ConfirmChannel>();

export async function publishConfirmed(
    channel: ConfirmChannel,
    exchange: string,
    routingKey: string,
    content: Buffer,
    properties: Options.Publish = {},
): Promise<void> {
    if (failedChannels.has(channel)) throw new Error("Reconnect before publishing again");
    if (publishingChannels.has(channel)) throw new Error("Concurrent publishes are not supported");
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