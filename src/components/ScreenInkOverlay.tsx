"use client";

// The glass sheet: a transparent, non-interactive ink layer over the whole
// projector view. Whatever the main display is showing - the Warm Notebook
// lesson stage, poll results, a tool - the iPad's "Write on screen" mode inks
// on top of it here. Never intercepts pointer events, so the machine driving
// the projector keeps working underneath. It announces its aspect ratio so the
// pen surface letterboxes to match, keeping every stroke exactly where the
// teacher put it.

import InkBoard from "./InkBoard";

export default function ScreenInkOverlay({ room }: { room: string }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40, pointerEvents: "none" }} aria-hidden>
      <InkBoard room={`${room}__over`} interactive={false} transparent passThrough announceView />
    </div>
  );
}
