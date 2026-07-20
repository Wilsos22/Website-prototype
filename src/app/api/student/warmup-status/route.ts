import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";
import type { LiveClassFlowSnapshot } from "@/lib/liveClassFlow";
import { currentWarmupResourceKey } from "@/lib/warmupResource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function classCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{2,8}$/.test(code)) {
    throw new StudentIdentityError("Enter the class code from your teacher.", 400, "invalid_join_code");
  }
  return code;
}

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as { code?: unknown };
    const code = classCode(body.code);

    const db = getSupabaseAdmin();
    if (!db) {
      throw new StudentIdentityError("Live sessions are not configured.", 503, "sessions_not_configured");
    }

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,period_id,live_flow")
      .eq("join_code", code)
      .eq("status", "open")
      .maybeSingle();
    if (sessionError) {
      throw new StudentIdentityError("The class session could not be checked.", 500, "session_lookup_failed");
    }
    if (!session) {
      throw new StudentIdentityError("That code is not open right now.", 404, "session_not_open");
    }
    if (session.period_id !== student.periodId) {
      throw new StudentIdentityError("That code belongs to a different class.", 403, "wrong_period");
    }

    const { data: receipt, error: receiptError } = await db
      .from("student_warmup_sessions")
      .select("completed_at,warmup_resource_key")
      .eq("auth_user_id", student.authUserId)
      .eq("session_id", session.id)
      .maybeSingle();
    if (receiptError) {
      throw new StudentIdentityError("Warm-up status could not be checked.", 500, "receipt_lookup_failed");
    }

    const currentResourceKey = currentWarmupResourceKey(session.live_flow as LiveClassFlowSnapshot | null);
    const complete = Boolean(
      currentResourceKey
      && receipt?.completed_at
      && receipt.warmup_resource_key === currentResourceKey,
    );

    return Response.json(
      {
        sessionId: session.id,
        complete,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
