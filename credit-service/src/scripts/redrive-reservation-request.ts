import { MAX_REQUEST_BYTES } from "../constants/consumer.constant.js";
import { connectReservationRequestMessaging, publishConfirmed, RESERVATION_REQUEST_MESSAGING } from "../libs/rabbitmq.js";
import { reservationRequestEventSchema } from "../schemas/reservation-request-event.schema.js";

const usage = "Usage: npm run redrive:reservation -- --limit <positive integer>";

async function redrive(limit: number): Promise<void> {
    const { connection, channel } = await connectReservationRequestMessaging();

    try {
        const { messageCount } = await channel.checkQueue(
            RESERVATION_REQUEST_MESSAGING.deadQueue
        );
        const count = Math.min(limit, messageCount);
        let forwarded = 0;

        for (let index = 0; index < count; index++) {
            const message = await channel.get(
                RESERVATION_REQUEST_MESSAGING.deadQueue,
                { noAck: false }
            );

            if (!message) break;

            let payload: unknown;

            try {
                if (message.content.length > MAX_REQUEST_BYTES) {
                    // Leave oversized messages in the dead-letter queue for manual inspection. Do not forward them.
                    throw new Error("INVALID_EVENT");
                }

                payload = JSON.parse(message.content.toString("utf8"));
            } catch {
                throw new Error("INVALID_EVENT");
            }
            const parsed = reservationRequestEventSchema.safeParse(payload);

            if (
                !parsed.success ||
                message.properties.messageId !== parsed.data.eventId
            ) {
                // Leave invalid messages in the dead-letter queue for manual inspection. Do not forward them.
                throw new Error("INVALID_EVENT");
            }

            const previousRedriveCount: unknown = message.properties.headers?.["x-redrive-count"] ?? 0;

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
                RESERVATION_REQUEST_MESSAGING.exchange,
                RESERVATION_REQUEST_MESSAGING.routingKeys.CREDIT_RESERVATION_REQUEST,
                message.content, // Preserve exact event bytes.
                {
                    messageId: message.properties.messageId,
                    contentType: message.properties.contentType ?? "application/json",
                    correlationId: message.properties.correlationId,
                    headers: {
                        ...message.properties.headers,
                        "x-retry-count": 0,
                        "x-redrive-count": previousRedriveCount + 1,
                        "x-redriven-at": new Date().toISOString(),
                    },
                },
            );

            // Remove the dead-queue copy only after the new publish is confirmed.
            channel.ack(message);
            forwarded++;

            console.info("Reservation request redrive", {
                eventId: parsed.data.eventId,
                requestType: parsed.data.requestType,
                orderId: parsed.data.orderId,
                redriveCount: previousRedriveCount + 1,
                outcome: "redriven",
            });
        }

        console.info("Reservation request redrive", {
            outcome: "complete",
            forwarded,
        });
    } finally {
        // Failure or interruption before ack leaves the original available for
        // redelivery. A lost ack can duplicate an event, never another balance mutation.
        // Flush acknowledgments on this channel before closing the connection.
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
        // Do not print raw broker errors, which may contain connection details.
        const reason =
            error instanceof Error &&
                ["INVALID_EVENT", "INVALID_REDRIVE_COUNT"].includes(error.message)
                ? error.message
                : "BROKER_OPERATION_FAILED";

        console.error("Reservation request redrive", {
            outcome: "stopped",
            reason,
        });
        process.exitCode = 1;
    }
}
