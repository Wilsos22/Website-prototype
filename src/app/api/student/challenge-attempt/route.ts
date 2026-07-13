import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireOpenJoinedSession,
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";
import { scoreAttempt } from "@/lib/challenges";

export const dynamic = "force-dynamic";

function boundedString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const url = new URL(request.url);
    const sessionId = boundedString(url.searchParams.get("sessionId"), 80);
    const challengeId = boundedString(url.searchParams.get("challengeId"), 80);
    await requireOpenJoinedSession(student, sessionId);

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Challenges are not configured.", 503, "challenges_not_configured");
    let challengeQuery = db
      .from("challenges")
      .select("id,session_id,skill,title,level,duration_seconds,status,started_at,ended_at")
      .eq("session_id", sessionId)
      .order("started_at", { ascending: false })
      .limit(1);
    if (challengeId) challengeQuery = challengeQuery.eq("id", challengeId);
    const { data: challenge, error: challengeError } = await challengeQuery.maybeSingle();
    if (challengeError) throw new StudentIdentityError("The challenge could not be loaded.", 500, "challenge_lookup_failed");

    if (!challenge) {
      return Response.json({ challenge: null, leaderboard: [] }, { headers: { "cache-control": "no-store" } });
    }

    const { data: attempts, error: attemptsError } = await db
      .from("challenge_attempts")
      .select("student_id,points,is_correct")
      .eq("challenge_id", challenge.id);
    if (attemptsError) throw new StudentIdentityError("Challenge results could not be loaded.", 500, "challenge_results_failed");

    const totals = new Map<string, { key: string; points: number; correct: number; total: number }>();
    for (const row of attempts ?? []) {
      if (!row.student_id) continue;
      const current = totals.get(row.student_id) ?? { key: row.student_id, points: 0, correct: 0, total: 0 };
      current.points += row.points ?? 0;
      current.total += 1;
      if (row.is_correct) current.correct += 1;
      totals.set(row.student_id, current);
    }
    const sorted = Array.from(totals.values()).sort((a, b) => b.points - a.points || b.correct - a.correct);
    const leaderboard = sorted.map((row, index) => ({
      ...row,
      key: row.key === student.id ? student.id : `player-${index + 1}`,
      name: row.key === student.id ? "You" : `Player ${index + 1}`,
    }));

    return Response.json({ challenge, leaderboard }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return studentIdentityResponse(error);
  }
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

    const isCorrect = answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    const points = scoreAttempt(isCorrect, timeMs ?? 0);

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
