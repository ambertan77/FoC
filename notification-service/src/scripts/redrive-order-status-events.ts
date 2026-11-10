import {
    connectOrderStatusMessaging,
    ORDER_STATUS_MESSAGING,
    publishConfirmed,
} from "../libs/rabbitmq.js";
import { orderStatusEventSchema } from "../schemas/order-status-event.schema.js";

const MAX_EVENT_BYTES = 65_536;

const usage =
    "Usage: npm run redrive:order-status-events -- --limit <positive integer>";

async function redrive(limit: number): Promise<void> {
    const { connection, channel } = await connectOrderStatusMessaging();

    try {
        const { messageCount } = await channel.checkQueue(
            ORDER_STATUS_MESSAGING.deadQueue,
        );

        const count = Math.min(limit, messageCount);
        let forwarded = 0;

        for (let index = 0; index < count; index++) {
            const message = await channel.get(
                ORDER_STATUS_MESSAGING.deadQueue,
                { noAck: false },
            );

            if (!message) break;

            let body: unknown;

            try {
                if (message.content.length > MAX_EVENT_BYTES) {
                    throw new Error("INVALID_EVENT");
                }

                body = JSON.parse(message.content.toString("utf8"));
            } catch {
                throw new Error("INVALID_EVENT");
            }

            const parsed = orderStatusEventSchema.safeParse(body);

            if (
                !parsed.success ||
                message.properties.messageId !== parsed.data.eventId
            ) {
                throw new Error("INVALID_EVENT");
            }

            const originalRoutingKey =
                message.properties.headers?.["x-original-routing-key"] ??
                message.fields.routingKey;

            if (
                originalRoutingKey !==
                ORDER_STATUS_MESSAGING.routingKeys.ORDER_STATUS_CHANGED
            ) {
                throw new Error("INVALID_ROUTING_KEY");
            }

            const previousRedriveCount: unknown =
                message.properties.headers?.["x-redrive-count"] ?? 0;

            if (
                typeof previousRedriveCount !== "number" ||
                !Number.isSafeInteger(previousRedriveCount) ||
                previousRedriveCount < 0 ||
                previousRedriveCount >= Number.MAX_SAFE_INTEGER
            ) {
                throw new Error("INVALID_REDRIVE_COUNT");
            }

            await publishConfirmed(
                channel,
                ORDER_STATUS_MESSAGING.exchange,
                ORDER_STATUS_MESSAGING.routingKeys.ORDER_STATUS_CHANGED,
                message.content,
                {
                    messageId: message.properties.messageId,
                    contentType:
                        message.properties.contentType ?? "application/json",
                    correlationId: message.properties.correlationId,
                    headers: {
                        ...message.properties.headers,
                        "x-retry-count": 0,
                        "x-redrive-count": previousRedriveCount + 1,
                        "x-redriven-at": new Date().toISOString(),
                    },
                },
            );

            // Remove the dead-lettered message only after republishing succeeds.
            channel.ack(message);
            forwarded++;

            console.info("Order status event redrive", {
                eventId: parsed.data.eventId,
                orderId: parsed.data.orderId,
                fromStatus: parsed.data.fromStatus,
                toStatus: parsed.data.toStatus,
                redriveCount: previousRedriveCount + 1,
                outcome: "redriven",
            });
        }

        console.info("Order status event redrive", {
            outcome: "complete",
            forwarded,
        });
    } finally {
        await channel.close().catch(() => undefined);
        await connection.close().catch(() => undefined);
    }
}

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === "--help") {
    console.info(usage);
} else if (
    args.length !== 2 ||
    args[0] !== "--limit" ||
    !/^[1-9]\d*$/.test(args[1] ?? "") ||
    !Number.isSafeInteger(Number(args[1]))
) {
    console.error(usage);
    process.exitCode = 1;
} else {
    try {
        await redrive(Number(args[1]));
    } catch (error) {
        const reason =
            error instanceof Error &&
                ["INVALID_EVENT", "INVALID_REDRIVE_COUNT"].includes(error.message)
                ? error.message
                : "BROKER_OPERATION_FAILED";

        console.error("Reservation result redrive", {
            outcome: "stopped",
            reason,
        });
        process.exitCode = 1;
    }
}