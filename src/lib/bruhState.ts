// Shared shapes + the state read for BRUH, used by both API routes.
//
// The board, the scoreboard, the iPad remote and the student page all render
// from the same snapshot. There is one source of truth (the database) and one
// reader (loadGameState), so a surface can never invent its own version of the
// round.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface BruhTeamRow {
  id: string;
  name: string;
  color: string;
  score: number;
  sort_order: number;
}

export interface BruhGameRow {
  id: string;
  session_id: string;
  set_name: string | null;
  questions: { n: number; topic: string; q: string; a: string }[];
  answer_seconds: number;
  lockout_seconds: number;
  explain_seconds: number;
  status: "lobby" | "playing" | "done";
}

export interface BruhRoundRow {
  id: string;
  game_id: string;
  question_n: number;
  topic: string | null;
  prompt: string;
  correct_answer: string;
  phase: "answering" | "reveal" | "spotlight" | "explain" | "reward" | "done";
  opened_at: string;
  ends_at: string;
  explain_ends_at: string | null;
  picked_team_id: string | null;
  reward: Record<string, unknown> | null;
  vocab: string[] | null;
}

/** A team's live state in the current round, derived from its latest attempt. */
export type BruhTeamPhase = "idle" | "in" | "locked" | "correct";

export interface BruhTeamState extends BruhTeamRow {
  phase: BruhTeamPhase;
  /** What they submitted. Withheld from everyone until the reveal. */
  answer: string | null;
  lockedUntil: string | null;
}

export interface BruhState {
  game: BruhGameRow;
  teams: BruhTeamState[];
  round: (Omit<BruhRoundRow, "correct_answer"> & { correctAnswer: string | null }) | null;
  spent: number[];
  /** Authoritative clock. Clients diff against this instead of trusting their own. */
  serverNow: string;
}

/** True once the round has moved past answering, so verdicts may be shown. */
export function isRevealed(phase: BruhRoundRow["phase"] | undefined): boolean {
  return phase === "reveal" || phase === "spotlight" || phase === "explain"
    || phase === "reward" || phase === "done";
}

/**
 * Read the whole game. `audience` gates the two secrets: while a round is still
 * open, students must not see the correct answer or who is right yet - the
 * board would leak the answer key straight to their laptops.
 */
export async function loadGameState(
  db: SupabaseClient,
  gameId: string,
  audience: "teacher" | "student",
): Promise<BruhState | null> {
  const { data: game } = await db
    .from("bruh_games")
    .select("id,session_id,set_name,questions,answer_seconds,lockout_seconds,explain_seconds,status")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) return null;

  const [teamsRes, roundsRes] = await Promise.all([
    db.from("bruh_teams").select("id,name,color,score,sort_order").eq("game_id", gameId).order("sort_order"),
    db.from("bruh_rounds")
      .select("id,game_id,question_n,topic,prompt,correct_answer,phase,opened_at,ends_at,explain_ends_at,picked_team_id,reward,vocab")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false }),
  ]);

  const teams = (teamsRes.data ?? []) as BruhTeamRow[];
  const rounds = (roundsRes.data ?? []) as BruhRoundRow[];
  const round = rounds[0] ?? null;
  const spent = rounds.map((r) => r.question_n);
  const now = new Date();

  let answers: { team_id: string; answer: string; is_correct: boolean; locked_until: string | null; submitted_at: string }[] = [];
  if (round) {
    const { data } = await db
      .from("bruh_answers")
      .select("team_id,answer,is_correct,locked_until,submitted_at")
      .eq("round_id", round.id)
      .order("submitted_at", { ascending: true });
    answers = data ?? [];
  }

  // A team may attempt again once its lockout expires, so the live state is the
  // latest row - except that a correct answer sticks and can't be undone by a
  // later wrong one.
  const latest = new Map<string, (typeof answers)[number]>();
  for (const a of answers) {
    const prev = latest.get(a.team_id);
    if (prev?.is_correct) continue;
    latest.set(a.team_id, a);
  }

  const revealed = isRevealed(round?.phase);
  const teamStates: BruhTeamState[] = teams.map((t) => {
    const a = latest.get(t.id);
    let phase: BruhTeamPhase = "idle";
    if (a) {
      if (a.is_correct) phase = revealed ? "correct" : "in";
      else if (a.locked_until && new Date(a.locked_until) > now) phase = "locked";
      else phase = revealed ? "locked" : "idle";
    }
    return {
      ...t,
      phase,
      // Withhold the submitted answer until the reveal, or the board leaks it.
      answer: revealed ? (a?.answer ?? null) : null,
      lockedUntil: a?.locked_until ?? null,
    };
  });

  const { correct_answer, ...roundPublic } = round ?? ({} as BruhRoundRow);
  const showAnswer = audience === "teacher" || revealed;

  return {
    game: game as BruhGameRow,
    teams: teamStates,
    round: round ? { ...roundPublic, correctAnswer: showAnswer ? correct_answer : null } : null,
    spent,
    serverNow: now.toISOString(),
  };
}
