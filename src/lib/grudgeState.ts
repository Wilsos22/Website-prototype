// Shared shapes + the state read for Grudge Ball. Mirrors bruhState.ts.
//
// The board, the scoreboard, the iPad remote and the student page all render from
// the same snapshot read by loadGameState. One source of truth (the database),
// one reader, so no surface can invent its own version of the round.

import type { SupabaseClient } from "@supabase/supabase-js";
import { reviveReady, type GrudgeScorable } from "@/lib/grudgeGame";

export interface GrudgeTeamRow {
  id: string;
  name: string;
  color: string;
  lives: number;
  out: boolean;
  wins_while_out: number;
  nemesis_team_id: string | null;
  sort_order: number;
}

export interface GrudgeGameRow {
  id: string;
  session_id: string;
  set_name: string | null;
  questions: { n: number; topic: string; q: string; a: string }[];
  answer_seconds: number;
  lockout_seconds: number;
  explain_seconds: number;
  shoot_seconds: number;
  starting_lives: number;
  revive_wins: number;
  revive_lives: number;
  status: "lobby" | "playing" | "done";
}

export interface GrudgeRoundRow {
  id: string;
  game_id: string;
  question_n: number;
  topic: string | null;
  prompt: string;
  correct_answer: string;
  phase: "answering" | "reveal" | "explain" | "shoot" | "steal" | "done";
  opened_at: string;
  ends_at: string;
  explain_ends_at: string | null;
  shoot_ends_at: string | null;
  champion_team_id: string | null;
  makes: number;
  makes_spent: number;
  steals: { from: string; to: string; at: string }[] | null;
  is_revive: boolean;
  vocab: string[] | null;
}

export type GrudgeAnswerPhase = "idle" | "in" | "locked" | "correct";

export interface GrudgeTeamState extends GrudgeTeamRow {
  /** This round's answer standing (mirrors BRUH's pod state). */
  phase: GrudgeAnswerPhase;
  /** What they submitted. Withheld until the reveal. */
  answer: string | null;
  lockedUntil: string | null;
  /** Out team has banked enough wins to come back with a grudge. */
  reviveReady: boolean;
}

export interface GrudgeState {
  game: GrudgeGameRow;
  teams: GrudgeTeamState[];
  round: (Omit<GrudgeRoundRow, "correct_answer"> & { correctAnswer: string | null }) | null;
  spent: number[];
  serverNow: string;
}

export interface GrudgeAnswerRow {
  team_id: string;
  answer: string;
  is_correct: boolean;
  locked_until: string | null;
  submitted_at: string;
}

/** Verdicts may be shown once the round has moved past answering. */
export function isRevealed(phase: GrudgeRoundRow["phase"] | undefined): boolean {
  return phase === "reveal" || phase === "explain" || phase === "shoot"
    || phase === "steal" || phase === "done";
}

/**
 * What each team shows this round. Pure, so the fiddly bit is testable without a
 * database. Same rules as BRUH's deriveTeamStates: a correct answer sticks, the
 * latest attempt otherwise wins, a wrong attempt locks until locked_until, and
 * nothing is revealed (verdict or submitted answer) before the reveal.
 */
export function deriveTeamStates(
  teams: GrudgeTeamRow[],
  answers: GrudgeAnswerRow[],
  revealed: boolean,
  reviveWins: number,
  now: Date,
): GrudgeTeamState[] {
  const latest = new Map<string, GrudgeAnswerRow>();
  for (const a of [...answers].sort((x, y) => x.submitted_at.localeCompare(y.submitted_at))) {
    const prev = latest.get(a.team_id);
    if (prev?.is_correct) continue;
    latest.set(a.team_id, a);
  }

  return teams.map((t) => {
    const a = latest.get(t.id);
    let phase: GrudgeAnswerPhase = "idle";
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
      reviveReady: reviveReady(t as unknown as GrudgeScorable, reviveWins),
    };
  });
}

/**
 * Read the whole game. `audience` gates the answer key: while a round is still
 * open, students must not see the correct answer or who is right.
 */
export async function loadGameState(
  db: SupabaseClient,
  gameId: string,
  audience: "teacher" | "student",
): Promise<GrudgeState | null> {
  const { data: game } = await db
    .from("grudge_games")
    .select("id,session_id,set_name,questions,answer_seconds,lockout_seconds,explain_seconds,shoot_seconds,starting_lives,revive_wins,revive_lives,status")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) return null;

  const [teamsRes, roundsRes] = await Promise.all([
    db.from("grudge_teams")
      .select("id,name,color,lives,out,wins_while_out,nemesis_team_id,sort_order")
      .eq("game_id", gameId)
      .order("sort_order"),
    db.from("grudge_rounds")
      .select("id,game_id,question_n,topic,prompt,correct_answer,phase,opened_at,ends_at,explain_ends_at,shoot_ends_at,champion_team_id,makes,makes_spent,steals,is_revive,vocab")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false }),
  ]);

  const teams = (teamsRes.data ?? []) as GrudgeTeamRow[];
  const rounds = (roundsRes.data ?? []) as GrudgeRoundRow[];
  const round = rounds[0] ?? null;
  const spent = rounds.map((r) => r.question_n);
  const now = new Date();

  let answers: GrudgeAnswerRow[] = [];
  if (round) {
    const { data } = await db
      .from("grudge_answers")
      .select("team_id,answer,is_correct,locked_until,submitted_at")
      .eq("round_id", round.id)
      .order("submitted_at", { ascending: true });
    answers = data ?? [];
  }

  const revealed = isRevealed(round?.phase);
  const teamStates = deriveTeamStates(teams, answers, revealed, (game as GrudgeGameRow).revive_wins, now);

  const { correct_answer, ...roundPublic } = round ?? ({} as GrudgeRoundRow);
  const showAnswer = audience === "teacher" || revealed;

  return {
    game: game as GrudgeGameRow,
    teams: teamStates,
    round: round ? { ...roundPublic, correctAnswer: showAnswer ? correct_answer : null } : null,
    spent,
    serverNow: now.toISOString(),
  };
}
