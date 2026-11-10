// AI Assistance Disclosure:
// Tool: ChatGPT (Astra 6)
// Date: approx. 2026-11-10
// Scope: Added secure cross-tab authentication session synchronization using browser storage events, without exposing refresh tokens.
// Author review: Reviewed, tested, and edited by Ng See Pui.

const AUTH_SESSION_EVENT = "auth-session-event";

type AuthSessionEvent = "login" | "logout";

export const broadcastAuthEvent = (event: AuthSessionEvent): void => {
    localStorage.setItem(
        AUTH_SESSION_EVENT,
        JSON.stringify({
            event,
            timestamp: Date.now(),
        }),
    );
};

// This function allows other tabs to listen for authentication events (login/logout) and respond accordingly.
export const subscribeToAuthEvents = (
    handler: (event: AuthSessionEvent) => void,
): (() => void) => {
    const listener = (storageEvent: StorageEvent) => {
        if (storageEvent.key !== AUTH_SESSION_EVENT || !storageEvent.newValue) {
            return;
        }

        const parsed: unknown = JSON.parse(storageEvent.newValue);
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            "event" in parsed &&
            (parsed.event === "login" || parsed.event === "logout")
        ) {
            handler(parsed.event);
        }
    };

    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
};