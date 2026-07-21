import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireStudentAuth,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";
import type { LiveClassFlowSnapshot } from "@/lib/liveClassFlow";
import { getTodayLesson } from "@/lib/notionLessons";
import { assignedWarmupLink, canonicalGoogleFormResource } from "@/lib/warmupResource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function classCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{2,8}$/.test(code)) {
    throw new StudentIdentityError("Enter the class code from your teacher.", 400, "invalid_join_code");
  }
  return code;
}

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
function withinSchoolHours(date = new Date()): boolean {
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
async function sessionFromPeriodCode(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  code: string,
  isAnonymous: boolean,
): Promise<{ id: string; live_flow: LiveClassFlowSnapshot | null } | null> {
  if (isAnonymous || !withinSchoolHours()) return null;
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

export async function POST(request: Request) {
  try {
    const identity = await requireStudentAuth(request);
    const body = await request.json().catch(() => ({})) as { code?: unknown };
    const code = classCode(body.code);

    const db = getSupabaseAdmin();
    if (!db) {
      throw new StudentIdentityError("Live sessions are not configured.", 503, "sessions_not_configured");
    }

    const { data: openSession, error: sessionError } = await db
      .from("sessions")
      .select("id,live_flow")
      .eq("join_code", code)
      .eq("status", "open")
      .maybeSingle();
    if (sessionError) {
      throw new StudentIdentityError("The class session could not be checked.", 500, "session_lookup_failed");
    }
    // Instant access: a period's permanent class code works before the
    // teacher has started anything - it opens the day's session on demand.
    const session = openSession || await sessionFromPeriodCode(db, code, identity.isAnonymous);
    if (!session) {
      throw new StudentIdentityError("That code is not open right now.", 404, "session_not_open");
    }

    const liveFlow = session.live_flow as LiveClassFlowSnapshot | null;
    const warmupUrl = assignedWarmupLink(liveFlow);
    const resourceKey = canonicalGoogleFormResource(warmupUrl);
    if (warmupUrl && !resourceKey) {
      throw new StudentIdentityError(
        "Today's warm-up needs to be reconnected by your teacher.",
        409,
        "warmup_form_not_connected",
      );
    }

    const { error: receiptError } = await db
      .from("student_warmup_sessions")
      .upsert(
        {
          auth_user_id: identity.authUserId,
          session_id: session.id,
          warmup_resource_key: resourceKey || null,
        },
        {
          onConflict: "auth_user_id,session_id",
          ignoreDuplicates: true,
        },
      );
    if (receiptError) {
      throw new StudentIdentityError("The warm-up could not be opened.", 500, "receipt_save_failed");
    }

    let { data: receipt, error: receiptLookupError } = await db
      .from("student_warmup_sessions")
      .select("verification_token,warmup_resource_key,completed_at")
      .eq("auth_user_id", identity.authUserId)
      .eq("session_id", session.id)
      .maybeSingle();
    if (receiptLookupError || !receipt?.verification_token) {
      throw new StudentIdentityError("The warm-up connection could not be loaded.", 500, "receipt_lookup_failed");
    }


    // Replacing the assigned Form invalidates the earlier open Form. Rotate the
    // one-time token and clear completion so only the newly assigned resource
    // can unlock this session.
    const nextResourceKey = resourceKey || null;
    if (receipt.warmup_resource_key !== nextResourceKey) {
      const previousToken = receipt.verification_token;
      const refreshResult = await db
        .from("student_warmup_sessions")
        .update({
          verification_token: crypto.randomUUID(),
          warmup_resource_key: nextResourceKey,
          started_at: new Date().toISOString(),
          completed_at: null,
        })
        .eq("auth_user_id", identity.authUserId)
        .eq("session_id", session.id)
        .eq("verification_token", previousToken)
        .select("verification_token,warmup_resource_key,completed_at")
        .maybeSingle();
      if (refreshResult.error) {
        throw new StudentIdentityError("The warm-up connection could not be refreshed.", 500, "receipt_refresh_failed");
      }
      if (refreshResult.data) {
        receipt = refreshResult.data;
      } else {
        const currentResult = await db
          .from("student_warmup_sessions")
          .select("verification_token,warmup_resource_key,completed_at")
          .eq("auth_user_id", identity.authUserId)
          .eq("session_id", session.id)
          .maybeSingle();
        if (currentResult.error || !currentResult.data) {
          throw new StudentIdentityError("The warm-up connection could not be confirmed.", 500, "receipt_refresh_failed");
        }
        receipt = currentResult.data;
      }
    }

    return Response.json(
      {
        sessionId: session.id,
        warmupToken: receipt.verification_token,
        warmUpLink: warmupUrl || null,
        lesson: liveFlow?.lesson
          ? {
              code: liveFlow.lesson.code || "",
              title: liveFlow.lesson.title || "",
            }
          : null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
