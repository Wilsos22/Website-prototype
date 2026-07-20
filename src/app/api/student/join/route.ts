import { recordSecurityEvent } from "@/lib/securityAudit";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";
import type { LiveClassFlowSnapshot } from "@/lib/liveClassFlow";
import { currentWarmupResourceKey } from "@/lib/warmupResource";

export const dynamic = "force-dynamic";

type JoinResolution = {
  outcome: string;
  join_id: string | null;
  resolved_student_id: string | null;
  resolved_display_name: string | null;
  resolved_joined_at: string | null;
};

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9]{2,8}$/.test(code)) {
      throw new StudentIdentityError("Enter the class code from your teacher.", 400, "invalid_join_code");
    }

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Live sessions are not configured.", 503, "sessions_not_configured");

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,period_id,live_flow")
      .eq("join_code", code)
      .eq("status", "open")
      .maybeSingle();
    if (sessionError) throw new StudentIdentityError("The class session could not be checked.", 500, "session_lookup_failed");
    if (!session) throw new StudentIdentityError("That code is not open right now.", 404, "session_not_open");
    if (session.period_id !== student.periodId) {
      void recordSecurityEvent({
        eventType: "student_join",
        outcome: "denied",
        authUserId: student.authUserId,
        studentId: student.id,
        sessionId: session.id,
        details: { reason: "wrong_period" },
      });
      throw new StudentIdentityError("That code belongs to a different class.", 403, "wrong_period");
    }

    // A roster link proves who is using this Chromebook; it does not prove the
    // assigned warm-up was completed for this class session. Enforce that
    // second boundary on the server so a direct join request cannot bypass it.
    const { data: warmupReceipt, error: warmupReceiptError } = await db
      .from("student_warmup_sessions")
      .select("completed_at,warmup_resource_key")
      .eq("auth_user_id", student.authUserId)
      .eq("session_id", session.id)
      .maybeSingle();
    if (warmupReceiptError) {
      throw new StudentIdentityError("Warm-up status could not be checked.", 500, "receipt_lookup_failed");
    }
    const currentResourceKey = currentWarmupResourceKey(session.live_flow as LiveClassFlowSnapshot | null);
    if (!currentResourceKey
      || !warmupReceipt?.completed_at
      || warmupReceipt.warmup_resource_key !== currentResourceKey) {
      throw new StudentIdentityError(
        "Complete today's warm-up before joining the live lesson.",
        428,
        "warmup_not_complete",
      );
    }

    const resolutionResult = await db.rpc("bdm_complete_verified_student_join_with_warmup", {
      p_session_id: session.id,
      p_student_id: student.id,
      p_auth_user_id: student.authUserId,
      p_display_name: student.fullName,
    });

    if (resolutionResult.error) {
      const schemaMissing = resolutionResult.error.code === "42883"
        || resolutionResult.error.code === "PGRST202";
      throw new StudentIdentityError(
        schemaMissing ? "Secure warm-up joining is not configured yet." : "The class session could not be joined.",
        schemaMissing ? 503 : 500,
        schemaMissing ? "join_schema_missing" : "join_save_failed",
      );
    } else {
      const resolution = ((resolutionResult.data as JoinResolution[] | null) ?? [])[0];
      if (!resolution || resolution.outcome !== "joined") {
        const code = resolution?.outcome || "join_conflict";
        void recordSecurityEvent({
          eventType: "student_join",
          outcome: code === "session_not_open" ? "denied" : "conflict",
          authUserId: student.authUserId,
          studentId: student.id,
          sessionId: session.id,
          details: { reason: code },
        });
        throw new StudentIdentityError(
          code === "session_not_open"
            ? "This class session is no longer open."
            : "Your class join changed. Ask your teacher to try again.",
          code === "session_not_open" ? 404 : 409,
          code,
        );
      }
    }

    void recordSecurityEvent({
      eventType: "student_join",
      outcome: "allowed",
      authUserId: student.authUserId,
      studentId: student.id,
      sessionId: session.id,
    });

    return Response.json(
      {
        session: {
          sessionId: session.id,
          studentId: student.id,
          name: student.fullName,
          syncKey: code,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
