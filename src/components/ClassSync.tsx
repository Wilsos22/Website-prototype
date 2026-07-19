"use client";

// Class Mode listener — mounted globally. If this device joined a session, it
// watches that session's "broadcast" field; when the teacher sends students to a
// view (e.g. /lesson or a tool), this navigates the screen to match. When the
// broadcast is empty/'free', students browse freely. Closing the session releases.

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { SECURE_STUDENT_DATA, studentApiRequest } from "@/lib/studentApi";
import {
  LIVE_FLOW_MODE,
  LIVE_FLOW_ROUTE,
  getStoredStudentSessionId,
  getStoredTeacherSessionId,
  hasClassModeExitMarker,
  isStudentTab,
  leaveClassMode,
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
  "/challenge",
  "/area-model",
  "/multiplication-fluency",
  "/combine-like-terms",
  "/ladder-method",
  "/group-bars",
  "/proportions",
  "/coordinate-grid",
  "/term-identifier",
  "/exit-ticket",
  "/checkpoint",
  "/bruh",
  "/grudge",
]);

type StudentSessionState = {
  broadcast: string | null;
  status: string;
  live_flow: {
    state?: { id?: string | null } | null;
    tool?: { route?: string } | null;
  } | null;
};

export const STUDENT_SESSION_READY_EVENT = "bdm-student-session-ready";

function isTeacherRoute(pathname: string) {
  return TEACHER_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isStudentSwitchRoute(pathname: string) {
  return STUDENT_SWITCH_ROUTE_PREFIXES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function shouldLeaveClassMode() {
  return typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("leaveClass");
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
    if (!supabase && !SECURE_STUDENT_DATA) return;
    if (isTeacherPreview()) return;
    if (shouldLeaveClassMode()) {
      leaveClassMode();
      const currentPath = pathRef.current || "/";
      router.replace(currentPath === LIVE_FLOW_ROUTE ? "/" : currentPath);
      return;
    }
    let stop = false;
    const tick = async () => {
      // Re-read browser state on every tick. A Chromebook can become verified
      // after this component mounts, when the warm-up response links it to the
      // roster and the student homepage stores the joined session.
      if (getStoredTeacherSessionId() && !isStudentTab()) return;
      if (hasClassModeExitMarker()) return;
      const sessionId = getStoredStudentSessionId();
      if (!sessionId) return;
      const currentPath = pathRef.current || "";
      if (isStudentSwitchRoute(currentPath)) return;
      if (isTeacherRoute(currentPath)) return;
      let data: StudentSessionState | null = null;
      let error: unknown = null;
      if (SECURE_STUDENT_DATA) {
        try {
          const result = await studentApiRequest<{ session: StudentSessionState | null }>(
            `/api/student/session-state?sessionId=${encodeURIComponent(sessionId)}`,
          );
          data = result.session;
        } catch (requestError) {
          error = requestError;
        }
      } else if (supabase) {
        const liveFlowQuery = await supabase
          .from("sessions")
          .select("broadcast,status,live_flow")
          .eq("id", sessionId)
          .maybeSingle();
        const fallbackQuery = liveFlowQuery.error
          ? await supabase.from("sessions").select("broadcast,status").eq("id", sessionId).maybeSingle()
          : null;
        data = (liveFlowQuery.data ?? fallbackQuery?.data) as StudentSessionState | null;
        error = liveFlowQuery.error && fallbackQuery?.error ? fallbackQuery.error : null;
      }
      if (stop) return;
      if (error || !data) {
        // Transient read error or a momentary empty result — keep the student in
        // the session and retry on the next tick instead of kicking them out
        // (that was what made students get asked to re-join mid-class).
        return;
      }
      const d = data;
      if (d.status === "closed") {
        leaveClassMode();
        return;
      }
      // Decide where this joined student should be. While the session is open
      // they're held in class — they can only roam when the teacher explicitly
      // sets "Free (browse)". Ending the session (status closed, above) is the
      // only thing that fully releases them.
      let target: string | null;
      if (d.broadcast === LIVE_FLOW_MODE) {
        // Warm-up stays on the student homepage. The assigned Google Form opens
        // in a second tab, and verified students may use solo challenge games
        // until the teacher advances into the instructional lesson flow. Also
        // hold the homepage during the brief handoff before state zero arrives.
        const liveStateId = d.live_flow?.state?.id || null;
        target = !liveStateId || liveStateId === "warmup"
          ? (currentPath === LIVE_FLOW_ROUTE ? "/" : null)
          : d.live_flow?.tool?.route || LIVE_FLOW_ROUTE;
      } else if (d.broadcast === "free") {
        target = null; // teacher released students to browse on their own
      } else if (d.broadcast && CLASS_MODE_TARGETS.has(d.broadcast)) {
        target = d.broadcast; // explicit destination (lesson or a tool)
      } else {
        target = "/lesson"; // joined but no destination yet, so hold on the lesson
      }
      if (target && currentPath !== target) {
        router.push(target);
      } else if (!target && currentPath === LIVE_FLOW_ROUTE) {
        router.push("/lesson");
      }
    };
    const handleStudentSessionReady = () => { void tick(); };
    void tick();
    const id = setInterval(tick, 3000);
    window.addEventListener(STUDENT_SESSION_READY_EVENT, handleStudentSessionReady);
    return () => {
      stop = true;
      clearInterval(id);
      window.removeEventListener(STUDENT_SESSION_READY_EVENT, handleStudentSessionReady);
    };
  }, [supabase, router, pathname]);

  return null;
}
