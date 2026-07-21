"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { SECURE_STUDENT_DATA, studentApiRequest } from "@/lib/studentApi";
import {
  LIVE_FLOW_MODE,
  getStoredStudentSessionId,
  type LiveClassFlowSnapshot,
  type LiveToolConfig,
  type LiveToolRoute,
} from "@/lib/liveClassFlow";

type SessionRow = {
  status: string;
  broadcast: string | null;
  live_flow: LiveClassFlowSnapshot | null;
};

export function useLiveToolConfig(route: LiveToolRoute): LiveToolConfig | null {
  const supabase = getSupabase();
  const [tool, setTool] = useState<LiveToolConfig | null>(null);

  useEffect(() => {
    const sessionId = getStoredStudentSessionId();
    if ((!supabase && !SECURE_STUDENT_DATA) || !sessionId) {
      setTool(null);
      return;
    }

    let stopped = false;
    const applySession = (row: SessionRow | null) => {
      if (stopped) return;
      const nextTool = row?.status === "open" && row.broadcast === LIVE_FLOW_MODE
        ? row.live_flow?.tool ?? null
        : null;
      setTool(nextTool?.route === route ? nextTool : null);
    };
    const readSession = async () => {
      if (SECURE_STUDENT_DATA) {
        try {
          const result = await studentApiRequest<{ session: SessionRow | null }>(
            `/api/student/session-state?sessionId=${encodeURIComponent(sessionId)}`,
          );
          applySession(result.session);
        } catch {
          applySession(null);
        }
        return;
      }
      if (!supabase) return;
      const { data, error } = await supabase
        .from("sessions")
        .select("status,broadcast,live_flow")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) {
        const fallback = await supabase
          .from("sessions")
          .select("status,broadcast")
          .eq("id", sessionId)
          .maybeSingle();
        applySession({ ...(fallback.data as Omit<SessionRow, "live_flow"> | null), live_flow: null } as SessionRow | null);
        return;
      }
      applySession(data as SessionRow | null);
    };

    void readSession();
    const interval = window.setInterval(readSession, 1000);
    const channel = SECURE_STUDENT_DATA || !supabase ? null : supabase
      .channel(`live-tool-${route}-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => applySession(payload.new as SessionRow),
      )
      .subscribe();

    return () => {
      stopped = true;
      window.clearInterval(interval);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [route, supabase]);

  return tool;
}

// `style` lets a host nudge placement only — e.g. spanning a multi-column grid.
// It merges last, so a caller can override, but the token colors are the default.
export function LiveToolBanner({ tool, style }: { tool: LiveToolConfig | null; style?: CSSProperties }) {
  if (!tool?.prompt.trim()) return null;

  // Every tool that renders this banner is a light surface — cream (--bdb-ground)
  // everywhere except /multiplication-fluency, which is white — so it is styled
  // from the design tokens: white card, ink text, amber accent rail. On the white
  // page the amber rail and hairline border are what separate it from the ground.
  return (
    <div
      style={{
        margin: "0 auto 14px",
        width: "100%",
        maxWidth: "min(92vw, 960px)",
        border: "1px solid var(--bdb-line)",
        borderLeft: "4px solid var(--bdb-amber)",
        borderRadius: "var(--bdb-r-sm)",
        background: "var(--bdb-card)",
        boxShadow: "var(--bdb-shadow-sm)",
        color: "var(--bdb-ink)",
        padding: "10px 14px",
        fontWeight: 800,
        lineHeight: 1.4,
        textAlign: "left",
        ...style,
      }}
    >
      <span style={{ color: "var(--bdb-ink-soft)", fontWeight: 700, fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Today&apos;s task</span>
      <div>{tool.prompt}</div>
    </div>
  );
}
