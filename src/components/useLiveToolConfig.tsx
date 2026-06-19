"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
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
    if (!supabase || !sessionId) {
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
      const { data } = await supabase
        .from("sessions")
        .select("status,broadcast,live_flow")
        .eq("id", sessionId)
        .maybeSingle();
      applySession(data as SessionRow | null);
    };

    void readSession();
    const interval = window.setInterval(readSession, 1000);
    const channel = supabase
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
      void supabase.removeChannel(channel);
    };
  }, [route, supabase]);

  return tool;
}

export function LiveToolBanner({ tool }: { tool: LiveToolConfig | null }) {
  if (!tool?.prompt.trim()) return null;

  return (
    <div
      style={{
        margin: "0 auto 14px",
        width: "min(92vw, 960px)",
        border: "1px solid rgba(250, 204, 21, 0.42)",
        borderRadius: 10,
        background: "rgba(250, 204, 21, 0.1)",
        color: "#fef3c7",
        padding: "10px 14px",
        fontWeight: 800,
        lineHeight: 1.4,
        textAlign: "center",
      }}
    >
      <span style={{ color: "#facc15", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Today&apos;s task</span>
      <div>{tool.prompt}</div>
    </div>
  );
}
