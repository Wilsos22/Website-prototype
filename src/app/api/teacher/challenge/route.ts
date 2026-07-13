import { endChallenge, fetchLeaderboard, launchChallenge } from "@/lib/challenges";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const url = new URL(request.url);
  const challengeId = url.searchParams.get("challengeId") || "";
  const sessionId = url.searchParams.get("sessionId") || "";

  if (challengeId) {
    const [{ data: challenge, error }, leaderboard, attemptsResult] = await Promise.all([
      db.from("challenges").select("*").eq("id", challengeId).maybeSingle(),
      fetchLeaderboard(db, challengeId),
      db.from("challenge_attempts")
        .select("prompt,correct_answer,is_correct")
        .eq("challenge_id", challengeId),
    ]);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!challenge) return Response.json({ error: "Challenge not found." }, { status: 404 });
    if (attemptsResult.error) return Response.json({ error: attemptsResult.error.message }, { status: 500 });
    const missMap = new Map<string, { prompt: string; correct_answer: string; wrong: number; total: number }>();
    for (const attempt of attemptsResult.data ?? []) {
      const current = missMap.get(attempt.prompt) ?? {
        prompt: attempt.prompt,
        correct_answer: attempt.correct_answer,
        wrong: 0,
        total: 0,
      };
      current.total += 1;
      if (!attempt.is_correct) current.wrong += 1;
      missMap.set(attempt.prompt, current);
    }
    const misses = Array.from(missMap.values())
      .filter((item) => item.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong)
      .slice(0, 12);
    return Response.json({ challenge, leaderboard, misses }, { headers: { "cache-control": "no-store" } });
  }

  let query = db.from("challenges").select("*").order("started_at", { ascending: false }).limit(60);
  if (sessionId) query = query.eq("session_id", sessionId);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const challenges = data ?? [];
  const sessionIds = Array.from(new Set(challenges.map((challenge) => challenge.session_id)));
  const sessionsResult = sessionIds.length
    ? await db.from("sessions").select("id,period_id").in("id", sessionIds)
    : { data: [], error: null };
  if (sessionsResult.error) return Response.json({ error: sessionsResult.error.message }, { status: 500 });
  const periodIds = Array.from(new Set((sessionsResult.data ?? []).map((session) => session.period_id)));
  const periodsResult = periodIds.length
    ? await db.from("periods").select("id,name").in("id", periodIds)
    : { data: [], error: null };
  if (periodsResult.error) return Response.json({ error: periodsResult.error.message }, { status: 500 });
  return Response.json(
    { challenges, sessions: sessionsResult.data ?? [], periods: periodsResult.data ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action, 20);

  if (action === "launch") {
    const sessionId = text(body.sessionId, 80);
    const skill = text(body.skill, 80);
    const title = text(body.title, 160);
    const level = Number.isInteger(body.level) ? Math.max(1, Math.min(Number(body.level), 3)) : 1;
    const durationSeconds = Number.isInteger(body.durationSeconds)
      ? Math.max(30, Math.min(Number(body.durationSeconds), 3600))
      : 180;
    if (!sessionId || !skill || !title) return Response.json({ error: "Session, skill, and title are required." }, { status: 400 });
    const { data: session } = await db.from("sessions").select("id,status").eq("id", sessionId).maybeSingle();
    if (!session || session.status !== "open") return Response.json({ error: "Open session not found." }, { status: 404 });
    const result = await launchChallenge(db, { sessionId, skill, title, level, durationSeconds });
    if (result.error) return Response.json({ error: result.error }, { status: 500 });
    return Response.json({ challenge: result.challenge }, { status: 201 });
  }

  if (action === "close") {
    const challengeId = text(body.challengeId, 80);
    if (!challengeId) return Response.json({ error: "Challenge is required." }, { status: 400 });
    await endChallenge(db, challengeId);
    return Response.json({ closed: true });
  }

  return Response.json({ error: "Unknown challenge action." }, { status: 400 });
}
