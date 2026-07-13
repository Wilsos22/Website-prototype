import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (code.length < 2 || code.length > 8) {
      throw new StudentIdentityError("Enter the class code from your teacher.", 400);
    }

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Live sessions are not configured on the server.", 503);

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,period_id")
      .eq("join_code", code)
      .eq("status", "open")
      .maybeSingle();
    if (sessionError) throw new StudentIdentityError("The class session could not be checked.", 500);
    if (!session) throw new StudentIdentityError("That code is not open right now. Check with your teacher.", 404);
    if (session.period_id !== student.periodId) {
      throw new StudentIdentityError("That code belongs to a different class.", 403);
    }

    const { error: joinError } = await db.from("session_joins").upsert(
      {
        session_id: session.id,
        student_id: student.id,
        display_name: student.fullName,
      },
      { onConflict: "session_id,student_id" },
    );
    if (joinError) throw new StudentIdentityError("The class session could not be joined.", 500);

    return Response.json({
      session: {
        sessionId: session.id,
        studentId: student.id,
        name: student.fullName,
      },
    });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
