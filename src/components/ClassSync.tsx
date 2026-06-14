"use client";

// Class Mode listener — mounted globally. If this device joined a session, it
// watches that session's "broadcast" field; when the teacher sends students to a
// view (e.g. /lesson or a tool), this navigates the screen to match. When the
// broadcast is empty/'free', students browse freely. Closing the session releases.

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function ClassSync() {
  const supabase = getSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!supabase) return;
    let sessionId: string | null = null;
    try { const s = localStorage.getItem("bdm-student-session"); if (s) sessionId = JSON.parse(s).sessionId; } catch { /* ignore */ }
    if (!sessionId) return;

    let stop = false;
    const tick = async () => {
      const { data } = await supabase.from("sessions").select("broadcast,status").eq("id", sessionId).maybeSingle();
      if (stop || !data) return;
      const d = data as { broadcast: string | null; status: string };
      if (d.status === "closed") { try { localStorage.removeItem("bdm-student-session"); } catch { /* ignore */ } return; }
      const target = d.broadcast;
      if (target && target !== "free" && target.startsWith("/") && pathRef.current !== target) {
        router.push(target);
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [supabase, router]);

  return null;
}
