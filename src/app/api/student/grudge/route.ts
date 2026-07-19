// Student half of Grudge Ball: read the round, pick a team, submit.
//
// Not in src/proxy.ts - like every /api/student/* route, it authenticates in the
// handler. Same two rules the client cannot argue with as BRUH: the server grades
// against grudge_rounds.correct_answer (the browser never sends the key), and the
// lockout and deadline are enforced against the server's own clock.

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireOpenJoinedSession,
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
  type VerifiedStudent,
} from "@/lib/studentIdentity";
import { SECURE_STUDENT_DATA } from "@/lib/studentApi";
import { gradeAnswer } from "@/lib/bruhGame";
import { loadGameState } from "@/lib/grudgeState";

export const dynamic = "force-dynamic";

const noStore = { headers: { "cache-control": "no-store" } };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Identify the student in whichever auth mode this deployment runs (see BRUH). */
async function identify(
  request: Request,
  sessionId: string,
  claimedStudentId: string,
): Promise<{ id: string; fullName: string | null }> {
  if (SECURE_STUDENT_DATA) {
    const student: VerifiedStudent = await requireVerifiedStudent(request);
    await requireOpenJoinedSession(student, sessionId);
    return { id: student.id, fullName: student.fullName };
  }
  if (!claimedStudentId) {
    throw new StudentIdentityError("Join the class before playing.", 403, "session_join_required");
  }
  const db = getSupabaseAdmin();
  if (!db) throw new StudentIdentityError("Live sessions are not configured.", 503, "sessions_not_configured");

  const { data: session } = await db.from("sessions").select("id,status").eq("id", sessionId).maybeSingle();
  if (!session || session.status !== "open") {
    throw new StudentIdentityError("This class session is no longer open.", 404, "session_not_open");
  }
  const { count } = await db.from("session_joins")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId).eq("student_id", claimedStudentId);
  if (!count) throw new StudentIdentityError("Join the class before playing.", 403, "session_join_required");

  const { data: student } = await db.from("students").select("id,full_name").eq("id", claimedStudentId).maybeSingle();
  if (!student) throw new StudentIdentityError("We could not find you on the roster.", 403, "student_not_found");
  return { id: student.id, fullName: student.full_name };
}

async function currentGameId(db: ReturnType<typeof getSupabaseAdmin>, sessionId: string): Promise<string | null> {
  if (!db) return null;
  const { data } = await db.from("grudge_games")
    .select("id").eq("session_id", sessionId).in("status", ["lobby", "playing"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = text(url.searchParams.get("sessionId"), 80);
    const studentId = text(url.searchParams.get("studentId"), 80);
    const student = await identify(request, sessionId, studentId);

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("The game is not configured.", 503, "grudge_not_configured");

    const gameId = await currentGameId(db, sessionId);
    if (!gameId) return Response.json({ game: null }, noStore);

    const state = await loadGameState(db, gameId, "student");
    if (!state) return Response.json({ game: null }, noStore);

    const { data: player } = await db.from("grudge_players")
      .select("team_id").eq("game_id", gameId).eq("student_id", student.id).maybeSingle();

    return Response.json({ ...state, myTeamId: player?.team_id ?? null }, noStore);
  } catch (error) {
    return studentIdentityResponse(error);
  }
}

// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sessionId = text(body.sessionId, 80);
    const claimedStudentId = text(body.studentId, 80);
    const action = text(body.action, 40);
    const student = await identify(request, sessionId, claimedStudentId);

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("The game is not configured.", 503, "grudge_not_configured");

    const gameId = await currentGameId(db, sessionId);
    if (!gameId) throw new StudentIdentityError("There is no game running right now.", 404, "no_game");

    if (action === "pick-team") {
      const teamId = text(body.teamId, 80);
      const { data: team } = await db.from("grudge_teams")
        .select("id").eq("id", teamId).eq("game_id", gameId).maybeSingle();
      if (!team) throw new StudentIdentityError("That team is not in this game.", 404, "team_not_found");

      const { data: existing } = await db.from("grudge_players")
        .select("team_id").eq("game_id", gameId).eq("student_id", student.id).maybeSingle();
      if (existing) return Response.json({ myTeamId: existing.team_id, alreadyPicked: true }, noStore);

      const { error } = await db.from("grudge_players")
        .insert({ game_id: gameId, student_id: student.id, team_id: teamId });
      if (error) throw new StudentIdentityError("Your team could not be saved.", 500, "team_save_failed");
      return Response.json({ myTeamId: teamId }, noStore);
    }

    if (action === "answer") {
      const answer = text(body.answer, 300);
      if (!answer) throw new StudentIdentityError("Type an answer first.", 400, "answer_missing");

      const { data: player } = await db.from("grudge_players")
        .select("team_id").eq("game_id", gameId).eq("student_id", student.id).maybeSingle();
      if (!player) throw new StudentIdentityError("Pick your team first.", 403, "team_required");

      const { data: round } = await db.from("grudge_rounds")
        .select("id,phase,ends_at,correct_answer").eq("game_id", gameId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!round) throw new StudentIdentityError("No question is open.", 409, "no_round");

      const now = new Date();
      if (round.phase !== "answering" || new Date(round.ends_at) <= now) {
        throw new StudentIdentityError("Answers are closed for this one.", 409, "round_closed");
      }

      const { data: prior } = await db.from("grudge_answers")
        .select("is_correct,locked_until,submitted_at").eq("round_id", round.id).eq("team_id", player.team_id)
        .order("submitted_at", { ascending: false }).limit(1).maybeSingle();

      if (prior?.is_correct) return Response.json({ accepted: false, reason: "already_in" }, noStore);
      if (prior?.locked_until && new Date(prior.locked_until) > now) {
        return Response.json(
          { accepted: false, reason: "locked", lockedUntil: prior.locked_until, serverNow: now.toISOString() },
          noStore,
        );
      }

      const isCorrect = gradeAnswer(answer, round.correct_answer);
      const { data: game } = await db.from("grudge_games").select("lockout_seconds").eq("id", gameId).maybeSingle();
      const lockSecs = game?.lockout_seconds ?? 20;
      const lockedUntil = !isCorrect && lockSecs > 0
        ? new Date(now.getTime() + lockSecs * 1000).toISOString() : null;

      const { error } = await db.from("grudge_answers").insert({
        round_id: round.id, team_id: player.team_id, student_id: student.id,
        answer, is_correct: isCorrect, locked_until: lockedUntil,
      });
      if (error) throw new StudentIdentityError("Your answer could not be saved.", 500, "answer_save_failed");

      return Response.json(
        { accepted: true, locked: !isCorrect && !!lockedUntil, lockedUntil, serverNow: now.toISOString() },
        noStore,
      );
    }

    throw new StudentIdentityError("Unknown action.", 400, "unknown_action");
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
