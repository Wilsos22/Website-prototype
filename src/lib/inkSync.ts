"use client";

// Real-time ink transport for the iPad → board annotation feature.
//
// Strokes are sent as NORMALISED coordinates (0..1) so the writing surface (iPad)
// and the display (board / panel) can be different sizes and still line up.
//
// Transport: Supabase Realtime *broadcast* (ephemeral, low-latency — no DB writes).
// When Supabase isn't configured (local dev with no keys), it falls back to a
// BroadcastChannel so two tabs/windows in the same browser still sync.

import { getSupabase } from "./supabase";

export interface InkPoint {
  x: number; // 0..1 across the writing surface
  y: number; // 0..1 down the writing surface
}

export interface InkStroke {
  id: string;
  color: string;
  erase: boolean;
  widthFrac: number; // line width as a fraction of surface width
  points: InkPoint[];
}

export type InkMessage =
  | { t: "seg"; id: string; color: string; erase: boolean; widthFrac: number; pts: InkPoint[]; start?: boolean }
  | { t: "clear" }
  | { t: "bg"; url: string | null }
  | { t: "problem"; text: string | null } // problem(s) to show with space to solve
  | { t: "hello" } // a display just opened — please resend current state
  | { t: "state"; strokes: InkStroke[]; bg: string | null; problem: string | null };

export interface InkChannel {
  send: (m: InkMessage) => void;
  close: () => void;
}

export function joinInkRoom(room: string, onMessage: (m: InkMessage) => void): InkChannel {
  const supabase = getSupabase();

  if (supabase) {
    const channel = supabase.channel(`ink-${room}`, { config: { broadcast: { self: false } } });
    let ready = false;
    const queue: InkMessage[] = [];
    channel
      .on("broadcast", { event: "ink" }, (payload) => {
        onMessage(payload.payload as InkMessage);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          ready = true;
          for (const m of queue.splice(0)) {
            void channel.send({ type: "broadcast", event: "ink", payload: m });
          }
        }
      });
    return {
      send: (m) => {
        if (ready) void channel.send({ type: "broadcast", event: "ink", payload: m });
        else queue.push(m);
      },
      close: () => { void supabase.removeChannel(channel); },
    };
  }

  // Fallback: same-browser cross-tab sync (local dev / single machine).
  const bc =
    typeof window !== "undefined" && "BroadcastChannel" in window
      ? new BroadcastChannel(`ink-${room}`)
      : null;
  if (bc) bc.onmessage = (e) => onMessage(e.data as InkMessage);
  return {
    send: (m) => bc?.postMessage(m),
    close: () => bc?.close(),
  };
}
