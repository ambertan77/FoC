import "dotenv/config";
import {
  connect,
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
  type Options,
} from "amqplib";


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

/** Call from a background worker, never from registration or HTTP startup. */
export async function connectRegistrationMessaging(): Promise<{
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
  connection.on("error", () => console.warn("RabbitMQ connection error; reconnect required"));
  try {
    const channel = await connection.createConfirmChannel();
    channel.on("error", () => console.warn("RabbitMQ channel error; reconnect required"));
    await declareRegistrationTopology(channel);
    return { connection, channel };
  } catch (error) {
    await connection.close().catch(() => undefined);
    throw error;
  }
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

export const publishUserRegistered = (
  channel: ConfirmChannel,
  content: Buffer,
  properties: Options.Publish = {},
) =>
  publishConfirmed(
    channel,
    REGISTRATION_MESSAGING.exchange,
    REGISTRATION_MESSAGING.routingKeys.USER_REGISTERED,
    content,
    properties,
  );