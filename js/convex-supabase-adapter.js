import { ConvexClient } from "https://esm.sh/convex@1.14.3/browser";
import { requireConvexUrl } from "./config.js";

function statusGuard(callbacks, status) {
  callbacks.forEach((cb) => {
    try {
      cb(status);
    } catch (error) {
      console.error("Status handler error", error);
    }
  });
}

class ConvexChannel {
  constructor(convexClient, channelName) {
    this.client = convexClient;
    this.channel = channelName;
    this.handlers = [];
    this.statusHandlers = [];
    this.unsubscribeFn = null;
    this.lastSequence = 0;
    this.isSubscribed = false;

    if (typeof window !== "undefined") {
      window.addEventListener("offline", () => {
        statusGuard(this.statusHandlers, "TIMED_OUT");
      });
      window.addEventListener("online", () => {
        if (this.isSubscribed) {
          statusGuard(this.statusHandlers, "SUBSCRIBED");
        }
      });
    }
  }

  on(type, filter, handler) {
    if (type !== "broadcast") {
      console.warn("ConvexChannel only supports broadcast events.");
      return this;
    }
    const eventName = typeof filter === "string" ? filter : filter?.event;
    this.handlers.push({ eventName, handler });
    return this;
  }

  async send({ type, event, payload }) {
    if (type !== "broadcast") {
      console.warn("ConvexChannel only supports broadcast payloads.");
      return;
    }
    try {
      await this.client.mutation("events:publish", {
        channel: this.channel,
        event,
        payload,
      });
    } catch (error) {
      console.error("Failed to publish Convex event", error);
      statusGuard(this.statusHandlers, "CHANNEL_ERROR");
      throw error;
    }
  }

  subscribe(callback) {
    if (callback) {
      this.statusHandlers.push(callback);
    }
    if (this.isSubscribed) {
      return this;
    }
    statusGuard(this.statusHandlers, "SUBSCRIBING");
    try {
      this.unsubscribeFn = this.client.subscribe(
        "events:stream",
        { channel: this.channel },
        (events) => {
          events
            .filter((event) => event.sequence > this.lastSequence)
            .forEach((event) => {
              this.lastSequence = Math.max(this.lastSequence, event.sequence);
              this.handlers.forEach((descriptor) => {
                if (
                  !descriptor.eventName ||
                  descriptor.eventName === event.event
                ) {
                  try {
                    descriptor.handler({ payload: event.payload });
                  } catch (error) {
                    console.error("Convex handler error", error);
                  }
                }
              });
            });
        },
      );
      this.isSubscribed = true;
      statusGuard(this.statusHandlers, "SUBSCRIBED");
    } catch (error) {
      console.error("Convex subscription error", error);
      statusGuard(this.statusHandlers, "CHANNEL_ERROR");
      throw error;
    }
    return Promise.resolve("SUBSCRIBED");
  }

  unsubscribe() {
    if (this.unsubscribeFn) {
      try {
        this.unsubscribeFn();
      } catch (error) {
        console.error("Convex unsubscribe failed", error);
      }
      this.unsubscribeFn = null;
    }
    this.isSubscribed = false;
    statusGuard(this.statusHandlers, "CLOSED");
  }
}

class ConvexSupabaseShim {
  constructor(convexUrl) {
    this.client = new ConvexClient(convexUrl);
    this.channels = new Map();
  }

  channel(name, _options) {
    if (!this.channels.has(name)) {
      this.channels.set(name, new ConvexChannel(this.client, name));
    }
    return this.channels.get(name);
  }
}

export function createClient(explicitUrl) {
  const url = explicitUrl || requireConvexUrl();
  return new ConvexSupabaseShim(url);
}
