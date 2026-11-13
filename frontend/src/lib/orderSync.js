/**
 * Cross-tab and real-time order synchronization utility.
 * Synchronizes order state across tabs immediately when fulfillment or
 * cancellation status changes occur.
 */

const CHANNEL_NAME = "tavilo:order-sync";
let channel = null;

try {
  if (typeof window !== "undefined" && "BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch {
  channel = null;
}

export function broadcastOrderUpdate(payload = {}) {
  const message = {
    type: "ORDER_UPDATED",
    timestamp: Date.now(),
    ...payload,
  };

  if (channel) {
    try {
      channel.postMessage(message);
    } catch {
      /* ignore broadcast error */
    }
  }

  // Storage fallback for cross-tab notifications where BroadcastChannel may be restricted
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem("tavilo:order_sync_event", JSON.stringify(message));
    } catch {
      /* ignore storage quota/access error */
    }
  }
}

export function subscribeToOrderUpdates(onUpdate) {
  if (typeof window === "undefined") return () => {};

  const handleMessage = (event) => {
    if (event?.data?.type === "ORDER_UPDATED") {
      onUpdate(event.data);
    }
  };

  const handleStorage = (event) => {
    if (event.key === "tavilo:order_sync_event" && event.newValue) {
      try {
        const data = JSON.parse(event.newValue);
        if (data?.type === "ORDER_UPDATED") {
          onUpdate(data);
        }
      } catch {
        /* ignore parse error */
      }
    }
  };

  if (channel) {
    channel.addEventListener("message", handleMessage);
  }
  window.addEventListener("storage", handleStorage);

  return () => {
    if (channel) {
      channel.removeEventListener("message", handleMessage);
    }
    window.removeEventListener("storage", handleStorage);
  };
}
