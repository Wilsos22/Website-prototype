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
    const body = await request.json().catch(() => ({})) as { pollId?: unknown; answer?: unknown };
    const pollId = typeof body.pollId === "string" ? body.pollId : "";
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    if (!pollId || !answer || answer.length > 2000) {
      throw new StudentIdentityError("A valid question and answer are required.", 400, "invalid_poll_answer");
    }

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Live questions are not configured.", 503, "polls_not_configured");
    const { data: poll, error: pollError } = await db
      .from("polls")
      .select("id,session_id,status")
      .eq("id", pollId)
      .maybeSingle();
    if (pollError) throw new StudentIdentityError("The live question could not be checked.", 500, "poll_lookup_failed");
    if (!poll || poll.status !== "open") {
      throw new StudentIdentityError("This live question is closed.", 409, "poll_closed");
    }

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,period_id,status")
      .eq("id", poll.session_id)
      .maybeSingle();
    if (sessionError) throw new StudentIdentityError("The class session could not be checked.", 500, "session_lookup_failed");
    if (!session || session.status !== "open" || session.period_id !== student.periodId) {
      throw new StudentIdentityError("This question is not open for your class.", 403, "poll_wrong_class");
    }

    const { count: joined, error: joinError } = await db
      .from("session_joins")
      .select("id", { count: "exact", head: true })
      .eq("session_id", session.id)
      .eq("student_id", student.id);
    if (joinError) throw new StudentIdentityError("Your class join could not be checked.", 500, "join_lookup_failed");
    if (!joined) throw new StudentIdentityError("Join the class before answering.", 403, "session_join_required");

    const { error: answerError } = await db.from("poll_answers").upsert(
      {
        poll_id: poll.id,
        student_id: student.id,
        display_name: student.fullName,
        answer,
      },
      { onConflict: "poll_id,student_id" },
    );
    if (answerError) throw new StudentIdentityError("Your answer could not be saved.", 500, "poll_answer_save_failed");

    return Response.json({ saved: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
