import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { requireOpenJoinedSession, requireVerifiedStudent, StudentIdentityError, studentIdentityResponse } from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim().slice(0, 80) : "";
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
    if (!question) throw new StudentIdentityError("Enter a question first.", 400, "question_empty");
    await requireOpenJoinedSession(student, sessionId);
    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Ask Abbie is not configured.", 503, "abbie_not_configured");
    const { data: existing, error: existingError } = await db
      .from("abbie_questions")
      .select("id")
      .eq("session_id", sessionId)
      .eq("student_id", student.id)
      .eq("status", "pending")
      .limit(1);
    if (existingError) throw new StudentIdentityError("Your question could not be checked.", 500, "abbie_lookup_failed");
    if (existing?.length) throw new StudentIdentityError("You already have a question waiting.", 409, "already_pending");
    const { error } = await db.from("abbie_questions").insert({
      session_id: sessionId,
      student_id: student.id,
      display_name: student.fullName,
      question,
    });
    if (error) throw new StudentIdentityError("Your question could not be sent.", 500, "abbie_save_failed");
    return Response.json({ saved: true });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
