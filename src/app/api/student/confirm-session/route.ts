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
    const body = await request.json().catch(() => ({})) as { sessionId?: unknown };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) throw new StudentIdentityError("The class session is missing.", 400, "session_id_missing");

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Live sessions are not configured.", 503, "sessions_not_configured");
    const { data: session, error } = await db
      .from("sessions")
      .select("id,period_id,status,join_code")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new StudentIdentityError("The class session could not be checked.", 500, "session_lookup_failed");
    if (!session || session.status !== "open") {
      throw new StudentIdentityError("This class session is no longer open.", 404, "session_not_open");
    }
    if (session.period_id !== student.periodId) {
      throw new StudentIdentityError("This session belongs to a different class.", 403, "wrong_period");
    }

    const { error: joinError } = await db.from("session_joins").upsert(
      { session_id: session.id, student_id: student.id, display_name: student.fullName },
      { onConflict: "session_id,student_id" },
    );
    if (joinError) throw new StudentIdentityError("The verified class join could not be saved.", 500, "join_save_failed");

    return Response.json(
      {
        session: {
          sessionId: session.id,
          studentId: student.id,
          name: student.fullName,
          syncKey: session.join_code,
        },
        student: { id: student.id, name: student.fullName, email: student.email },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
