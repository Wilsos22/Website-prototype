"use client";

// Ephemeral iPad -> teacher control commands. This deliberately uses the same
// Supabase Realtime transport as the ink board, so no lesson-state table or
// command history is added. The /control page remains the timer authority.

import { getSupabase } from "./supabase";

export type LiveFlowTransportCommand = "back" | "toggle" | "reset" | "next";

export type LiveFlowTransportMessage =
  | { type: "ping"; id: string; sentAt: string }
  | { type: "command"; id: string; command: LiveFlowTransportCommand; sentAt: string }
  | { type: "ack"; id: string; sentAt: string };

export interface LiveFlowTransportChannel {
  send: (message: LiveFlowTransportMessage) => void;
  close: () => void;
}

export function newLiveFlowTransportId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function joinLiveFlowTransport(
  sessionId: string,
  onMessage: (message: LiveFlowTransportMessage) => void,
): LiveFlowTransportChannel {
  const supabase = getSupabase();
  const channelName = `live-flow-transport-${sessionId}`;

  if (supabase) {
    const channel = supabase.channel(channelName, { config: { broadcast: { self: false } } });
    let ready = false;
    const queue: LiveFlowTransportMessage[] = [];
    channel
      .on("broadcast", { event: "transport" }, (payload) => {
        onMessage(payload.payload as LiveFlowTransportMessage);
      })
      .subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        ready = true;
        for (const message of queue.splice(0)) {
          void channel.send({ type: "broadcast", event: "transport", payload: message });
        }
      });

    return {
      send: (message) => {
        if (ready) void channel.send({ type: "broadcast", event: "transport", payload: message });
        else queue.push(message);
      },
      close: () => { void supabase.removeChannel(channel); },
    };
  }

  const fallback = typeof window !== "undefined" && "BroadcastChannel" in window
    ? new BroadcastChannel(channelName)
    : null;
  if (fallback) fallback.onmessage = (event) => onMessage(event.data as LiveFlowTransportMessage);
  return {
    send: (message) => fallback?.postMessage(message),
    close: () => fallback?.close(),
  };
}
