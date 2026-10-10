import { AUTH_EVENT_CHANNEL, AUTH_EVENT_STORAGE_KEY } from "@/constants/auth";

export type AuthEvent = "logout" | "session-changed";

function isAuthEvent(value: unknown): value is AuthEvent {
  return value === "logout" || value === "session-changed";
}

/** Notifications carry no identity or credentials. Receivers must ask the BFF. */
export function publishAuthEvent(event: AuthEvent) {
  if (typeof window === "undefined") return;
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(AUTH_EVENT_CHANNEL);
    channel.postMessage(event);
    channel.close();
  } else {
    try {
      localStorage.setItem(
        AUTH_EVENT_STORAGE_KEY,
        JSON.stringify({ event, nonce: crypto.randomUUID() }),
      );
    } catch {
      // Storage can be unavailable; focus revalidation remains available.
    }
  }
}

export function subscribeAuthEvents(listener: () => void) {
  const channel =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(AUTH_EVENT_CHANNEL) : null;
  if (channel)
    channel.onmessage = (message: MessageEvent<unknown>) => {
      if (isAuthEvent(message.data)) listener();
    };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_EVENT_STORAGE_KEY || !event.newValue) return;
    if (event.storageArea !== null && event.storageArea !== localStorage) return;
    try {
      const data: unknown = JSON.parse(event.newValue);
      if (typeof data === "object" && data !== null && "event" in data && isAuthEvent(data.event))
        listener();
    } catch {
      /* Ignore unrelated/malformed notifications. */
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}
