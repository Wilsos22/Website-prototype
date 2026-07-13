"use client";

// Global Abbie bubble for student devices. Mounted once in the root layout
// (next to ClassSync). For a device that joined a class session, it watches the
// session's "abbie" field; when the teacher summons Abbie, her line pops as a
// short-lived speech bubble over whatever screen the student is on — the lesson,
// a tool, or the Live Flow screen. Audio stays on the teacher's projector, so
// this is visual-only (no 30-Chromebook echo). Silent no-op if not joined.

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { SECURE_STUDENT_DATA, studentApiRequest } from "@/lib/studentApi";
import {
  getStoredStudentSessionId,
  getStoredTeacherSessionId,
  isStudentTab,
  type AbbieBroadcast,
} from "@/lib/liveClassFlow";

export default function AbbieStudentBubble() {
  const supabase = getSupabase();
  const [line, setLine] = useState<string | null>(null);
  const seenNonce = useRef<string | null>(null);
  const dismissRef = useRef<number | null>(null);

  useEffect(() => {
    if (!supabase && !SECURE_STUDENT_DATA) return;
    // A teacher device shouldn't get the student bubble (unless this tab
    // explicitly joined as a student, for side-by-side testing).
    if (getStoredTeacherSessionId() && !isStudentTab()) return;
    const sessionId = getStoredStudentSessionId();
    if (!sessionId) return;

    let stopped = false;
    const apply = (abbie: AbbieBroadcast | null) => {
      if (stopped || !abbie?.nonce || !abbie.text) return;
      // First read after mount just records the current line without popping it,
      // so refreshing mid-class doesn't replay a line the student already saw.
      if (seenNonce.current === null) { seenNonce.current = abbie.nonce; return; }
      if (abbie.nonce === seenNonce.current) return;
      seenNonce.current = abbie.nonce;
      setLine(abbie.text);
      if (dismissRef.current) window.clearTimeout(dismissRef.current);
      dismissRef.current = window.setTimeout(() => setLine(null), 13000);
    };

    const read = async () => {
      if (SECURE_STUDENT_DATA) {
        try {
          const result = await studentApiRequest<{ session: { abbie: AbbieBroadcast | null } | null }>(
            `/api/student/session-state?sessionId=${encodeURIComponent(sessionId)}`,
          );
          apply(result.session?.abbie ?? null);
        } catch {
          // A transient error should not interrupt the student's task.
        }
        return;
      }
      if (!supabase) return;
      const { data, error } = await supabase
        .from("sessions")
        .select("abbie")
        .eq("id", sessionId)
        .maybeSingle();
      // Missing column / transient error - just don't show anything.
      if (error || stopped || !data) return;
      apply((data as { abbie: AbbieBroadcast | null }).abbie ?? null);
    };

    void read();
    const interval = window.setInterval(read, 1500);
    const channel = SECURE_STUDENT_DATA || !supabase ? null : supabase
      .channel(`abbie-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}` },
        (payload) => apply((payload.new as { abbie: AbbieBroadcast | null }).abbie ?? null),
      )
      .subscribe();

    return () => {
      stopped = true;
      window.clearInterval(interval);
      if (dismissRef.current) window.clearTimeout(dismissRef.current);
      if (channel && supabase) void supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (!line) return null;

  return (
    <div className="abs-stage" aria-live="polite">
      <style>{`
        .abs-stage { position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:80; width:min(94vw,720px); pointer-events:none; }
        .abs-bubble { position:relative; display:flex; gap:15px; align-items:flex-start; background:#0d1f1b; border:1px solid #1f4d45; border-left:6px solid #2dd4bf; border-radius:18px; padding:18px 22px; box-shadow:0 20px 60px rgba(0,0,0,0.5); animation:absIn 0.34s cubic-bezier(0.2,1.3,0.4,1); pointer-events:auto; }
        @keyframes absIn { from{opacity:0; transform:translateY(16px);} to{opacity:1; transform:none;} }
        .abs-av { width:52px; height:52px; border-radius:50%; background:#14241f; display:grid; place-items:center; overflow:hidden; flex:none; }
        .abs-av img { width:46px; height:46px; object-fit:contain; }
        .abs-name { font-size:0.7rem; font-weight:900; letter-spacing:0.11em; text-transform:uppercase; color:#5eead4; margin-bottom:3px; }
        .abs-text { color:#f3fffb; font-size:clamp(1.1rem,2.4vw,1.5rem); font-weight:800; line-height:1.3; }
      `}</style>
      <div className="abs-bubble">
        <div className="abs-av">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/big-dog-mark.png" alt="" /></div>
        <div>
          <div className="abs-name">Abbie</div>
          <div className="abs-text">{line}</div>
        </div>
      </div>
    </div>
  );
}
