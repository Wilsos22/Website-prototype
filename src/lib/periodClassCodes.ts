// Permanent period class codes: the instant warm-up access layer.
//
// Two roles, two endpoints:
// - /api/student/session-code RECOGNIZES codes (public, read-only): an open
//   session's join code, or a period's permanent class code during school
//   hours. Recognition never creates anything.
// - /api/student/warmup-start CREATES the day's session on demand (requires
//   a signed-in district account): reuses the period's open session or
//   auto-creates one seeded with today's published warm-up form, in exactly
//   the flow-snapshot shape the bdm_complete_warmup_identity verifier reads.

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { LiveClassFlowSnapshot } from "@/lib/liveClassFlow";
import { getTodayLesson } from "@/lib/notionLessons";
import { canonicalGoogleFormResource } from "@/lib/warmupResource";

const CLASSROOM_TIME_ZONE = "America/Los_Angeles";

function classroomDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLASSROOM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Today's warm-up form, straight from the published Notion lesson's warmup
 * step. Used only when a session has no teacher-assigned flow yet, so the
 * first student of the day gets the form without waiting. Once the teacher
 * loads a lesson into the session, the assigned link always wins.
 */
async function todaysWarmupFlow(): Promise<{ url: string; lessonCode: string; lessonTitle: string } | null> {
  try {
    const lesson = await getTodayLesson(classroomDate());
    const url = lesson?.steps.find((step) => step.stateId?.trim().toLowerCase() === "warmup")?.linkUrl
      || lesson?.warmUpLink
      || "";
    if (!lesson || !canonicalGoogleFormResource(url)) return null;
    return { url, lessonCode: lesson.lessonCode || "", lessonTitle: lesson.title || "" };
  } catch {
    return null;
  }
}

/**
 * The instant-access window: school-day mornings through the afternoon,
 * classroom time. Outside it a class code does nothing on its own, so an
 * off-hours code can neither open sessions nor reach the form. The teacher
 * path is unaffected - a session he starts works at any hour.
 */
export function withinSchoolHours(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLASSROOM_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (values.weekday === "Sat" || values.weekday === "Sun") return false;
  const hour = Number(values.hour);
  return hour >= 6 && hour < 16;
}

/**
 * Instant warm-up access: when no session is open for the typed code, treat
 * the code as a period's permanent class code and open the day's session
 * server-side. The session row anchors the existing receipt/verification
 * chain unchanged, and the teacher's /session page later finds and inherits
 * this same open session. Two guards keep the permanent code defensible:
 * only a signed-in district account (never anonymous auth) can trigger it,
 * and only during school hours. Tolerant of the period-class-codes.sql
 * migration not having run yet: every failure falls through to null and the
 * caller raises the original "not open" error.
 */
export async function sessionFromPeriodCode(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  code: string,
  authBlocked: boolean,
): Promise<{ id: string; live_flow: LiveClassFlowSnapshot | null } | null> {
  if (authBlocked || !withinSchoolHours()) return null;
  try {
    const periodResult = await db
      .from("periods")
      .select("id,class_code")
      .ilike("class_code", code)
      .maybeSingle();
    if (periodResult.error || !periodResult.data) return null;
    const periodId = periodResult.data.id as string;

    const openResult = await db
      .from("sessions")
      .select("id,live_flow")
      .eq("period_id", periodId)
      .eq("status", "open")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openResult.data) {
      return openResult.data as { id: string; live_flow: LiveClassFlowSnapshot | null };
    }

    const today = await todaysWarmupFlow();
    // A minimal flow snapshot whose warmup step carries the form URL: the
    // bdm_complete_warmup_identity verifier reads exactly this path, so the
    // receipt chain works before the teacher has loaded anything. broadcast
    // stays "free", so no classroom surface renders this placeholder.
    const seedFlow = today
      ? {
          sequence: { currentIndex: 0, steps: [{ stateId: "warmup", resourceUrl: today.url }] },
          lesson: { code: today.lessonCode, title: today.lessonTitle },
        }
      : null;
    const insertResult = await db
      .from("sessions")
      .insert({ period_id: periodId, join_code: code, status: "open", broadcast: "free", live_flow: seedFlow })
      .select("id,live_flow")
      .maybeSingle();
    if (insertResult.data) {
      return insertResult.data as { id: string; live_flow: LiveClassFlowSnapshot | null };
    }

    // Unique-index race: another student created it first - use theirs.
    const retryResult = await db
      .from("sessions")
      .select("id,live_flow")
      .eq("period_id", periodId)
      .eq("status", "open")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (retryResult.data as { id: string; live_flow: LiveClassFlowSnapshot | null } | null) || null;
  } catch {
    return null;
  }
}


/** Recognition only: does this code name a period with a permanent class code? */
export async function periodExistsForClassCode(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  code: string,
): Promise<boolean> {
  try {
    const result = await db
      .from("periods")
      .select("id")
      .ilike("class_code", code)
      .maybeSingle();
    return Boolean(!result.error && result.data);
  } catch {
    return false;
  }
}
