import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireOpenJoinedSession,
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

function boundedString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const challengeId = boundedString(body.challengeId, 80);
    const sessionId = boundedString(body.sessionId, 80);
    const prompt = boundedString(body.prompt, 1000);
    const correctAnswer = boundedString(body.correctAnswer, 500);
    const answer = boundedString(body.answer, 500);
    const isCorrect = body.isCorrect === true;
    const points = Number.isInteger(body.points) ? Math.max(0, Math.min(Number(body.points), 10000)) : 0;
    const timeMs = Number.isInteger(body.timeMs) ? Math.max(0, Math.min(Number(body.timeMs), 3_600_000)) : null;
    if (!challengeId || !prompt || !correctAnswer) {
      throw new StudentIdentityError("A valid challenge attempt is required.", 400, "invalid_challenge_attempt");
    }
    await requireOpenJoinedSession(student, sessionId);

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Challenges are not configured.", 503, "challenges_not_configured");
    const { data: challenge, error: challengeError } = await db
      .from("challenges")
      .select("id,session_id,status")
      .eq("id", challengeId)
      .maybeSingle();
    if (challengeError) throw new StudentIdentityError("The challenge could not be checked.", 500, "challenge_lookup_failed");
    if (!challenge || challenge.status !== "open" || challenge.session_id !== sessionId) {
      throw new StudentIdentityError("This challenge is not open for your class.", 409, "challenge_closed");
    }

    const { error: saveError } = await db.from("challenge_attempts").insert({
      challenge_id: challenge.id,
      session_id: sessionId,
      student_id: student.id,
      display_name: student.fullName,
      prompt,
      correct_answer: correctAnswer,
      answer,
      is_correct: isCorrect,
      points,
      time_ms: timeMs,
    });
    if (saveError) throw new StudentIdentityError("Your challenge attempt could not be saved.", 500, "challenge_save_failed");

    return Response.json({ saved: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
