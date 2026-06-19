"use client";

// Class Mode listener — mounted globally. If this device joined a session, it
// watches that session's "broadcast" field; when the teacher sends students to a
// view (e.g. /lesson or a tool), this navigates the screen to match. When the
// broadcast is empty/'free', students browse freely. Closing the session releases.

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import {
  LIVE_FLOW_MODE,
  LIVE_FLOW_ROUTE,
  STUDENT_SESSION_KEY,
  getStoredStudentSessionId,
} from "@/lib/liveClassFlow";

const TEACHER_ROUTE_PREFIXES = ["/teacher", "/control", "/session", "/roster"];
const STUDENT_SWITCH_ROUTE_PREFIXES = ["/join"];
const CLASS_MODE_TARGETS = new Set([
  LIVE_FLOW_ROUTE,
  "/lesson",
  "/whiteboard",
  "/number-line-plus",
  "/percent-bar",
  "/equation-builder",
  "/order-of-operations",
  "/fraction-bars",
  "/algebra-tiles",
]);

function isTeacherRoute(pathname: string) {
  return TEACHER_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isStudentSwitchRoute(pathname: string) {
  return STUDENT_SWITCH_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
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
    const sessionId = getStoredStudentSessionId();
    if (!sessionId) return;

    let stop = false;
    const tick = async () => {
      const currentPath = pathRef.current || "";
      if (isStudentSwitchRoute(currentPath)) return;
      if (isTeacherRoute(currentPath)) return;
      const liveFlowQuery = await supabase
        .from("sessions")
        .select("broadcast,status,live_flow")
        .eq("id", sessionId)
        .maybeSingle();
      // Keep the existing class-mode routing working until the optional
      // live_flow column has been added to this project's Supabase database.
      const fallbackQuery = liveFlowQuery.error
        ? await supabase.from("sessions").select("broadcast,status").eq("id", sessionId).maybeSingle()
        : null;
      const data = liveFlowQuery.data ?? fallbackQuery?.data;
      const error = liveFlowQuery.error && fallbackQuery?.error ? fallbackQuery.error : null;
      if (stop) return;
      if (error || !data) {
        clearStoredSession();
        return;
      }
      const d = data as {
        broadcast: string | null;
        status: string;
        live_flow: { tool?: { route?: string } | null } | null;
      };
      if (d.status === "closed") {
        clearStoredSession();
        return;
      }
      const target = d.broadcast === LIVE_FLOW_MODE
        ? d.live_flow?.tool?.route || LIVE_FLOW_ROUTE
        : d.broadcast === "free"
          ? null
          : d.broadcast;
      if (target && CLASS_MODE_TARGETS.has(target) && currentPath !== target) {
        router.push(target);
      }
      if (!target && currentPath === LIVE_FLOW_ROUTE) {
        router.push("/lesson");
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(id); };
  }, [supabase, router]);

  return null;
}
