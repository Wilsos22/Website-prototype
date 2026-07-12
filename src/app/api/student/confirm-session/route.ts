import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as { sessionId?: unknown };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) throw new StudentIdentityError("The class session is missing.", 400);

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Live sessions are not configured.", 503);
    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,period_id,status")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw new StudentIdentityError("The class session could not be checked.", 500);
    if (!session || session.status !== "open") throw new StudentIdentityError("This class session is no longer open.", 404);
    if (session.period_id !== student.periodId) throw new StudentIdentityError("This session belongs to a different class.", 403);

    const { error: joinError } = await db.from("session_joins").upsert(
      { session_id: session.id, student_id: student.id, display_name: student.fullName },
      { onConflict: "session_id,student_id" },
    );
    if (joinError) throw new StudentIdentityError("The verified class join could not be saved.", 500);

    return Response.json({
      session: { sessionId: session.id, studentId: student.id, name: student.fullName },
      student: { id: student.id, name: student.fullName, email: student.email },
    });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
