// AI Assistance Disclosure:
// Tool: Claude Code (Claude Sonnet 5.5)
// Date: 2026-11-10
// Scope: Later edit to this file: Replaced console.* with the pino logger.
// Author review: Reviewed, tested, checked by Duong Ngoc Mai.

// AI Assistance Disclosure:
// Tool: ChatGPT (5.6 Luna), Claude Code (Claude Sonnet 5.5)
// Date: approx. 2026-11-05
// Scope: Refactored RabbitMQ functionality so its connection, channel, publishing, consuming, and retry-related functions are reusable.
// Author review: Reviewed, tested, and edited by Ng See Pui.

import "dotenv/config";
import {
  connect,
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
  type Options,
} from "amqplib";
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
  await channel.assertExchange(t.exchange, t.exchangeType, {
    durable: true,
    autoDelete: false,
  });

  // Main queue
  await channel.assertQueue(t.queue, quorumQueueOptions);
  for (const key of t.bindingKeys) {
    await channel.bindQueue(t.queue, t.exchange, key);
  }

  // Dead queue: the consumer publishes here after max attempts
  await channel.assertQueue(t.deadQueue, quorumQueueOptions);

  // Retry queue: holds a message for retryDelayMs, then dead-letters it
  // via the default exchange straight back to the main queue (by queue name),
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

// --------------------- For user registration events ---------------------
// Keep this topology identical in user-service and credit-service. Each service
// declares it independently so startup order does not affect message routing.
export const REGISTRATION_MESSAGING = {
  exchange: "user.events",
  exchangeType: "topic",
  routingKeys: {
    USER_REGISTERED: "user.registered.v1",
  },
  bindingKeys: ["user.registered.v1"],
  queue: "credit.user-registered.v1",
  retryQueue: "credit.user-registered.retry.v1",
  deadQueue: "credit.user-registered.dead.v1",
  retryDelayMs: 10_000,
} as const;

export const declareRegistrationTopology = (channel: Channel) =>
  declareConsumerTopology(channel, REGISTRATION_MESSAGING);

// --------------------- For settlement events---------------------
export const SETTLEMENT_MESSAGING = {
  exchange: "order.events",
  exchangeType: "topic",
  routingKeys: {
    ORDER_RECEIVED: "order.received.v1",
    ORDER_FAILED: "order.failed.v1",
    ORDER_CANCELED: "order.canceled.v1",
    ORDER_EXPIRED: "order.expired.v1",
  },
  bindingKeys: ["order.*.v1"], // matches all four events above
  queue: "credit.order-events.v1",
  retryQueue: "credit.order-events.retry.v1",
  deadQueue: "credit.order-events.dead.v1",
  retryDelayMs: 10_000,
} as const;

export const declareSettlementTopology = (channel: Channel) =>
  declareConsumerTopology(channel, SETTLEMENT_MESSAGING);

// --------------------- For reservation request events ---------------------
export const RESERVATION_REQUEST_MESSAGING = {
  exchange: "credit.commands",
  exchangeType: "direct",
  routingKeys: {
    RESERVE_CREDITS: "credit.reserve.v1",
  },
  queue: "credit.reserve.v1",
  retryQueue: "credit.reserve.retry.v1",
  deadQueue: "credit.reserve.dead.v1",
  retryDelayMs: 10_000,
} as const;

export const declareReservationRequestTopology = (channel: Channel) =>
  declareConsumerTopology(channel, {
    ...RESERVATION_REQUEST_MESSAGING,
    bindingKeys: Object.values(RESERVATION_REQUEST_MESSAGING.routingKeys),
  });

// --------------------- For reservation result events ---------------------
export const RESERVATION_RESULT_MESSAGING = {
  exchange: "credit.events",
  exchangeType: "topic",
  routingKeys: {
    CREDIT_RESERVATION_SUCCEEDED: "credit.reservation.succeeded.v1",
    CREDIT_RESERVATION_FAILED: "credit.reservation.failed.v1",
  },
  bindingKeys: ["credit.reservation.*.v1"], // matches succeeded + failed
  queue: "order.credit-events.v1",
  retryQueue: "order.credit-events.retry.v1",
  deadQueue: "order.credit-events.dead.v1",
  retryDelayMs: 10_000,
} as const;

export const declareReservationResultTopology = (channel: Channel) =>
  declareConsumerTopology(channel, RESERVATION_RESULT_MESSAGING);


// ---------------------  Connection helpers --------------------- 
/** Call from a background worker, never from registration or HTTP startup. */
async function connectMessaging(declareTopology: (channel: Channel) => Promise<void>): Promise<{
  connection: ChannelModel;
  channel: ConfirmChannel;
}> {
  // Read lazily: missing broker configuration must not prevent HTTP startup.
  const value = process.env.RABBITMQ_URL;
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

export function connectRegistrationMessaging() {
  return connectMessaging(declareRegistrationTopology);
}

export function connectSettlementMessaging() {
  return connectMessaging(declareSettlementTopology);
}

export function connectReservationRequestMessaging() {
  return connectMessaging(declareReservationRequestTopology);
}

const publishingChannels = new WeakSet<ConfirmChannel>();
const failedChannels = new WeakSet<ConfirmChannel>();

/**
 * One in-flight publish per dedicated channel makes returns unambiguous.
 * Resolve only after a positive confirm without a preceding mandatory return.
 * On failure, reconnect before publishing again; the outcome may be uncertain.
 */
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

export function connectReservationResultMessaging() {
  return connectMessaging(declareReservationResultTopology);
}

export type ReservationResultKind =
  keyof typeof RESERVATION_RESULT_MESSAGING.routingKeys;

export function publishReservationResult(
  channel: ConfirmChannel,
  kind: ReservationResultKind,
  content: Buffer,
  properties: Options.Publish = {},
): Promise<void> {
  return publishConfirmed(
    channel,
    RESERVATION_RESULT_MESSAGING.exchange,
    RESERVATION_RESULT_MESSAGING.routingKeys[kind],
    content,
    properties,
  );
}