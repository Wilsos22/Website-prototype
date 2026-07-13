import { recordSecurityEvent } from "@/lib/securityAudit";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

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
      .select("id,period_id")
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

    const { error: joinError } = await db.from("session_joins").upsert(
      {
        session_id: session.id,
        student_id: student.id,
        display_name: student.fullName,
      },
      { onConflict: "session_id,student_id" },
    );
    if (joinError) throw new StudentIdentityError("The class session could not be joined.", 500, "join_save_failed");

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
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
