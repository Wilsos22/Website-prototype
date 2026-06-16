"use client";

// Class Mode listener — mounted globally. If this device joined a session, it
// watches that session's "broadcast" field; when the teacher sends students to a
// view (e.g. /lesson or a tool), this navigates the screen to match. When the
// broadcast is empty/'free', students browse freely. Closing the session releases.

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

const STUDENT_SESSION_KEY = "bdm-student-session";
const TEACHER_ROUTE_PREFIXES = ["/teacher", "/control", "/session", "/roster"];
const CLASS_MODE_TARGETS = new Set([
  "/lesson",
  "/whiteboard",
  "/number-line-plus",
  "/percent-bar",
  "/equation-builder",
  "/order-of-operations",
]);

function isTeacherRoute(pathname: string) {
  return TEACHER_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function getStoredSessionId() {
  try {
    const stored = localStorage.getItem(STUDENT_SESSION_KEY);
    if (!stored) return null;
    const session = JSON.parse(stored) as { sessionId?: unknown };
    return typeof session.sessionId === "string" && session.sessionId ? session.sessionId : null;
  } catch {
    return null;
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(STUDENT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function isTeacherPreview() {
  return typeof window !== "undefined"
    && (window.self !== window.top || new URLSearchParams(window.location.search).has("teacherPreview"));
}

export default function ClassSync() {
  const supabase = getSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!supabase) return;
    if (isTeacherPreview()) return;
    const sessionId = getStoredSessionId();
    if (!sessionId) return;

    let stop = false;
    const tick = async () => {
      const currentPath = pathRef.current || "";
      if (isTeacherRoute(currentPath)) return;
      const { data, error } = await supabase.from("sessions").select("broadcast,status").eq("id", sessionId).maybeSingle();
      if (stop) return;
      if (error || !data) {
        clearStoredSession();
        return;
      }
      const d = data as { broadcast: string | null; status: string };
      if (d.status === "closed") {
        clearStoredSession();
        return;
      }
      const target = d.broadcast;
      if (target && CLASS_MODE_TARGETS.has(target) && currentPath !== target) {
        router.push(target);
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [supabase, router]);

  return null;
}
