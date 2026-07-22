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
  p?: number; // Apple Pencil pressure 0..1 (absent for mouse)
}

export interface InkStroke {
  id: string;
  color: string;
  erase: boolean;
  m?: "p" | "h"; // pen (default) or highlighter; erase wins over m
  widthFrac: number; // line width as a fraction of surface width
  points: InkPoint[];
}

export type InkMessage =
  | { t: "seg"; id: string; color: string; erase: boolean; m?: "p" | "h"; widthFrac: number; pts: InkPoint[]; start?: boolean; end?: boolean }
  | { t: "clear" }
  | { t: "bg"; url: string | null }
  | { t: "problem"; text: string | null } // problem(s) to show with space to solve
  | { t: "scratch"; open: boolean } // open/close the scratch overlay on the board
  | { t: "view"; ar: number } // the display announces its stage aspect ratio so the pen surface can letterbox to match
  | { t: "remove"; ids: string[] } // undo / stroke-eraser: these strokes vanish
  | { t: "restore"; stroke: InkStroke } // redo / undo-of-erase: put a stroke back
  | { t: "replace"; stroke: InkStroke } // hold-to-straighten: swap a stroke's points for the fitted shape
  | { t: "laser"; id: string; pts: InkPoint[]; end?: boolean } // pointer trail - drawn fading, never stored
  | { t: "hello" } // a display just opened — please resend current state
  | { t: "state"; strokes: InkStroke[]; bg: string | null; problem: string | null };

export interface InkChannel {
  send: (m: InkMessage) => void;
  close: () => void;
}

export type InkConnectionStatus = "connecting" | "connected" | "disconnected";

export function joinInkRoom(
  room: string,
  onMessage: (m: InkMessage) => void,
  onStatus?: (status: InkConnectionStatus) => void,
): InkChannel {
  const supabase = getSupabase();

  if (supabase) {
    onStatus?.("connecting");
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
          onStatus?.("connected");
          for (const m of queue.splice(0)) {
            void channel.send({ type: "broadcast", event: "ink", payload: m });
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          ready = false;
          onStatus?.("disconnected");
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
  onStatus?.(bc ? "connected" : "disconnected");
  if (bc) bc.onmessage = (e) => onMessage(e.data as InkMessage);
  return {
    send: (m) => bc?.postMessage(m),
    close: () => bc?.close(),
  };
}
