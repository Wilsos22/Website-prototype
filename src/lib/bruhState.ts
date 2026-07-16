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

export interface BruhAnswerRow {
  team_id: string;
  answer: string;
  is_correct: boolean;
  locked_until: string | null;
  submitted_at: string;
}

/**
 * Turn a round's raw attempts into what each team's pod shows. Pure, so the
 * fiddly bit of the game can be reasoned about without a database.
 *
 * Rules, in order:
 *  - A correct answer sticks. Once a team is in, a later row cannot un-in them.
 *  - Otherwise the latest attempt wins.
 *  - A wrong attempt locks the team until locked_until passes; after that they
 *    are free to try again while the round is still open.
 *  - Before the reveal nobody's verdict is shown: a correct team reads as "in",
 *    an expired-lockout team reads as "idle", and no submitted answer is
 *    exposed. Otherwise the board would leak the answer key to the room.
 */
export function deriveTeamStates(
  teams: BruhTeamRow[],
  answers: BruhAnswerRow[],
  revealed: boolean,
  now: Date,
): BruhTeamState[] {
  const latest = new Map<string, BruhAnswerRow>();
  for (const a of [...answers].sort((x, y) => x.submitted_at.localeCompare(y.submitted_at))) {
    const prev = latest.get(a.team_id);
    if (prev?.is_correct) continue;
    latest.set(a.team_id, a);
  }

  return teams.map((t) => {
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
      answer: revealed ? (a?.answer ?? null) : null,
      lockedUntil: a?.locked_until ?? null,
    };
  });
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

  let answers: BruhAnswerRow[] = [];
  if (round) {
    const { data } = await db
      .from("bruh_answers")
      .select("team_id,answer,is_correct,locked_until,submitted_at")
      .eq("round_id", round.id)
      .order("submitted_at", { ascending: true });
    answers = data ?? [];
  }

  const revealed = isRevealed(round?.phase);
  const teamStates = deriveTeamStates(teams, answers, revealed, now);

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
