// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6), Claude Code (Claude Sonnet 5.5)
// Date: approx. 2026-11-09
// Scope: Generated the frontend notification service, including notification state management and Server-Sent Events handling.
// Author review: Reviewed, tested, and edited by Ng See Pui.

export interface SseMessage {
    id?: string;
    event: string;
    data: string;
}

interface ConnectOptions {
    url: string;
    getToken: () => string | null;
    onMessage: (message: SseMessage) => void;
    onOpen?: () => void;
    onAuthError?: () => void;
    signal: AbortSignal;
}

// Parses a block of SSE text into an SseMessage object. Returns null if the block is empty or contains no data.
function parseBlock(block: string): SseMessage | null {
    let id: string | undefined;
    let event = "message";
    const data: string[] = [];

    for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;

        const separator = line.indexOf(":");
        const field =
            separator === -1 ? line : line.slice(0, separator);
        const value =
            separator === -1
                ? ""
                : line.slice(separator + 1).replace(/^ /, "");

        if (field === "id") id = value;
        if (field === "event") event = value;
        if (field === "data") data.push(value);
    }

    return data.length > 0
        ? {
              id,
              event,
              data: data.join("\n"),
          }
        : null;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const timer = window.setTimeout(resolve, ms);

        signal.addEventListener(
            "abort",
            () => {
                window.clearTimeout(timer);
                resolve();
            },
            { once: true },
        );
    });
}

export async function connectSse({
    url,
    getToken,
    onMessage,
    onOpen,
    onAuthError,
    signal,
}: ConnectOptions): Promise<void> {
    let lastEventId: string | undefined;
    let attempt = 0;

    while (!signal.aborted) {
        try {
            const token = getToken();

            if (!token) {
                onAuthError?.();
                return;
            }

            const headers: HeadersInit = {
                Accept: "text/event-stream",
                Authorization: `Bearer ${token}`,
            };

            // On reconnect, send the last event ID to resume from where we left off
            if (lastEventId) {
                headers["Last-Event-ID"] = lastEventId;
            }

            const response = await fetch(url, {
                method: "GET",
                headers,
                credentials: "include",
                signal,
            });

            if (response.status === 401) {
                onAuthError?.();
                return;
            }

            if (!response.ok || !response.body) {
                throw new Error(`SSE request failed: ${response.status}`);
            }

            attempt = 0;
            onOpen?.();

            const reader = response.body
                .pipeThrough(new TextDecoderStream())
                .getReader();

            let buffer = "";

            try {
                while (!signal.aborted) {
                    const { value, done } = await reader.read();

                    if (done) break;

                    buffer += value.replace(/\r\n/g, "\n");

                    let boundary: number;

                    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
                        const block = buffer.slice(0, boundary);
                        buffer = buffer.slice(boundary + 2);

                        const message = parseBlock(block);

                        if (!message) continue;

                        if (message.id) {
                            lastEventId = message.id;
                        }

                        onMessage(message);
                    }
                }
            } finally {
                reader.releaseLock();
            }
        } catch (error) {
            if (signal.aborted) return;

            console.warn("Notification SSE disconnected", error);
        }

        // Exponential backoff with a maximum delay of 30 seconds
        if (!signal.aborted) {
            await sleep(
                Math.min(1_000 * 2 ** attempt++, 30_000),
                signal,
            );
        }
    }
}