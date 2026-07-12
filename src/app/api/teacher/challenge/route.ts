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
    const [{ data: challenge, error }, leaderboard] = await Promise.all([
      db.from("challenges").select("*").eq("id", challengeId).maybeSingle(),
      fetchLeaderboard(db, challengeId),
    ]);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!challenge) return Response.json({ error: "Challenge not found." }, { status: 404 });
    return Response.json({ challenge, leaderboard }, { headers: { "cache-control": "no-store" } });
  }

  let query = db.from("challenges").select("*").order("started_at", { ascending: false }).limit(60);
  if (sessionId) query = query.eq("session_id", sessionId);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ challenges: data ?? [] }, { headers: { "cache-control": "no-store" } });
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
