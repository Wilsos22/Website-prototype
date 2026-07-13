import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as { pollId?: unknown; answer?: unknown };
    const pollId = typeof body.pollId === "string" ? body.pollId : "";
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    if (!pollId || !answer || answer.length > 2000) {
      throw new StudentIdentityError("A valid question and answer are required.", 400);
    }

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Live questions are not configured.", 503);
    const { data: poll, error: pollError } = await db
      .from("polls")
      .select("id,session_id,status")
      .eq("id", pollId)
      .maybeSingle();
    if (pollError) throw new StudentIdentityError("The live question could not be checked.", 500);
    if (!poll || poll.status !== "open") throw new StudentIdentityError("This live question is closed.", 409);

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,period_id,status")
      .eq("id", poll.session_id)
      .maybeSingle();
    if (sessionError) throw new StudentIdentityError("The class session could not be checked.", 500);
    if (!session || session.status !== "open" || session.period_id !== student.periodId) {
      throw new StudentIdentityError("This question is not open for your class.", 403);
    }

    const { error: answerError } = await db.from("poll_answers").upsert(
      {
        poll_id: poll.id,
        student_id: student.id,
        display_name: student.fullName,
        answer,
      },
      { onConflict: "poll_id,student_id" },
    );
    if (answerError) throw new StudentIdentityError("Your answer could not be saved.", 500);
    return Response.json({ saved: true });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
