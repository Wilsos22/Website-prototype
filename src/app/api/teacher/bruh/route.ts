// Teacher control for the BRUH review game.
// Gated by src/proxy.ts via the existing /api/teacher prefix.
//
// This route is the referee. The board, the iPad remote and the interactive
// screen all just POST actions here and re-render whatever comes back, which is
// why any of them can drive the game and none of them can disagree about it.

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { drawReward, pickVocab, rewardByKey, teamColor, type BruhReward } from "@/lib/bruhGame";
import { loadGameState, type BruhTeamRow } from "@/lib/bruhState";

export const dynamic = "force-dynamic";

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function intIn(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

const noStore = { headers: { "cache-control": "no-store" } };

// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return bad("Database not configured.", 503);
  const url = new URL(request.url);
  const gameId = text(url.searchParams.get("gameId"), 80);

  // No gameId: the admin page asking for its saved banks.
  if (!gameId) {
    const { data, error } = await db
      .from("bruh_sets")
      .select("id,name,questions,updated_at")
      .order("updated_at", { ascending: false });
    if (error) return bad(error.message, 500);
    return Response.json({ sets: data ?? [] }, noStore);
  }

  const state = await loadGameState(db, gameId, "teacher");
  if (!state) return bad("Game not found.", 404);
  return Response.json(state, noStore);
}

// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return bad("Database not configured.", 503);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = text(body.action, 40);

  switch (action) {
    // ---- question banks -------------------------------------------------
    case "save-set": {
      const name = text(body.name, 120);
      const questions = Array.isArray(body.questions) ? body.questions : null;
      if (!name || !questions?.length) return bad("A named set with at least one question is required.");
      const id = text(body.id, 80);
      if (id) {
        const { data, error } = await db
          .from("bruh_sets")
          .update({ name, questions, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id,name,questions,updated_at")
          .maybeSingle();
        if (error) return bad(error.message, 500);
        return Response.json({ set: data }, noStore);
      }
      const { data, error } = await db
        .from("bruh_sets")
        .insert({ name, questions })
        .select("id,name,questions,updated_at")
        .maybeSingle();
      if (error) return bad(error.message, 500);
      return Response.json({ set: data }, noStore);
    }

    case "delete-set": {
      const id = text(body.id, 80);
      if (!id) return bad("A set id is required.");
      const { error } = await db.from("bruh_sets").delete().eq("id", id);
      if (error) return bad(error.message, 500);
      return Response.json({ deleted: true }, noStore);
    }

    // ---- launch ---------------------------------------------------------
    case "launch": {
      const sessionId = text(body.sessionId, 80);
      const questions = Array.isArray(body.questions) ? body.questions : null;
      const teamNames = Array.isArray(body.teams) ? body.teams.map((t) => text(t, 40)).filter(Boolean) : [];
      if (!sessionId) return bad("Start a class session first.");
      if (!questions?.length) return bad("A question bank is required.");
      if (teamNames.length < 2) return bad("Name at least two teams.");

      const { data: game, error } = await db
        .from("bruh_games")
        .insert({
          session_id: sessionId,
          set_name: text(body.setName, 120) || null,
          questions,
          answer_seconds: intIn(body.answerSeconds, 5, 600, 120),
          lockout_seconds: intIn(body.lockoutSeconds, 0, 300, 20),
          explain_seconds: intIn(body.explainSeconds, 15, 600, 120),
          status: "playing",
        })
        .select("id")
        .maybeSingle();
      if (error || !game) return bad(error?.message ?? "The game could not be started.", 500);

      const { error: teamError } = await db.from("bruh_teams").insert(
        teamNames.map((name, i) => ({ game_id: game.id, name, color: teamColor(i), sort_order: i })),
      );
      if (teamError) return bad(teamError.message, 500);

      const state = await loadGameState(db, game.id, "teacher");
      return Response.json(state, noStore);
    }

    // ---- the round loop -------------------------------------------------
    case "open-round": {
      const gameId = text(body.gameId, 80);
      const n = intIn(body.questionN, 1, 999, 0);
      if (!gameId || !n) return bad("A game and question number are required.");

      const { data: game } = await db
        .from("bruh_games")
        .select("id,questions,answer_seconds")
        .eq("id", gameId)
        .maybeSingle();
      if (!game) return bad("Game not found.", 404);

      const questions = game.questions as { n: number; topic: string; q: string; a: string }[];
      const q = questions.find((x) => x.n === n);
      if (!q) return bad("That question is not in this game.", 404);

      // Refuse to replay a tile. The board disables spent tiles, but the iPad
      // remote could race it and two open rounds would fight over the board.
      const { data: already } = await db
        .from("bruh_rounds")
        .select("id")
        .eq("game_id", gameId)
        .eq("question_n", n)
        .maybeSingle();
      if (already) return bad("That question has already been played.", 409);

      const endsAt = new Date(Date.now() + game.answer_seconds * 1000).toISOString();
      const { data: round, error } = await db
        .from("bruh_rounds")
        .insert({
          game_id: gameId,
          question_n: n,
          topic: q.topic,
          prompt: q.q,
          correct_answer: q.a,
          phase: "answering",
          ends_at: endsAt,
          vocab: pickVocab(q.topic ?? "", q.q ?? ""),
        })
        .select("id")
        .maybeSingle();
      if (error || !round) return bad(error?.message ?? "The round could not be opened.", 500);

      const state = await loadGameState(db, gameId, "teacher");
      return Response.json(state, noStore);
    }

    case "close-round": {
      // "Close early" and the natural expiry land here alike.
      const roundId = text(body.roundId, 80);
      if (!roundId) return bad("A round is required.");
      const { data: round, error } = await db
        .from("bruh_rounds")
        .update({ phase: "reveal", ends_at: new Date().toISOString() })
        .eq("id", roundId)
        .eq("phase", "answering")
        .select("game_id")
        .maybeSingle();
      if (error) return bad(error.message, 500);
      if (!round) {
        // Already closed by the other surface - not an error, just re-read.
        const gameId = text(body.gameId, 80);
        const state = gameId ? await loadGameState(db, gameId, "teacher") : null;
        return state ? Response.json(state, noStore) : bad("Round not found.", 404);
      }
      const state = await loadGameState(db, round.game_id, "teacher");
      return Response.json(state, noStore);
    }

    case "pick": {
      // Random spotlight among the teams that got it right. Server-side, so the
      // board's sweep animation is theatre over a decided result.
      const roundId = text(body.roundId, 80);
      if (!roundId) return bad("A round is required.");
      const { data: round } = await db
        .from("bruh_rounds")
        .select("id,game_id")
        .eq("id", roundId)
        .maybeSingle();
      if (!round) return bad("Round not found.", 404);

      const { data: correct } = await db
        .from("bruh_answers")
        .select("team_id")
        .eq("round_id", roundId)
        .eq("is_correct", true);
      const ids = Array.from(new Set((correct ?? []).map((r) => r.team_id)));
      if (!ids.length) return bad("Nobody got it right.", 409);

      const forced = text(body.teamId, 80);
      const picked = forced && ids.includes(forced)
        ? forced
        : ids[Math.floor(Math.random() * ids.length)];

      const { error } = await db
        .from("bruh_rounds")
        .update({ phase: "spotlight", picked_team_id: picked })
        .eq("id", roundId);
      if (error) return bad(error.message, 500);
      const state = await loadGameState(db, round.game_id, "teacher");
      return Response.json(state, noStore);
    }

    case "to-board": {
      const roundId = text(body.roundId, 80);
      if (!roundId) return bad("A round is required.");
      const { data: round } = await db
        .from("bruh_rounds")
        .select("id,game_id,bruh_games!inner(explain_seconds)")
        .eq("id", roundId)
        .maybeSingle();
      if (!round) return bad("Round not found.", 404);
      const secs = (round as unknown as { bruh_games: { explain_seconds: number } }).bruh_games.explain_seconds;
      const { error } = await db
        .from("bruh_rounds")
        .update({ phase: "explain", explain_ends_at: new Date(Date.now() + secs * 1000).toISOString() })
        .eq("id", roundId);
      if (error) return bad(error.message, 500);
      const state = await loadGameState(db, round.game_id, "teacher");
      return Response.json(state, noStore);
    }

    case "to-reward": {
      const roundId = text(body.roundId, 80);
      if (!roundId) return bad("A round is required.");
      const { data: round, error } = await db
        .from("bruh_rounds")
        .update({ phase: "reward" })
        .eq("id", roundId)
        .select("game_id")
        .maybeSingle();
      if (error) return bad(error.message, 500);
      if (!round) return bad("Round not found.", 404);
      const state = await loadGameState(db, round.game_id, "teacher");
      return Response.json(state, noStore);
    }

    // ---- the draw -------------------------------------------------------
    case "draw": {
      const roundId = text(body.roundId, 80);
      if (!roundId) return bad("A round is required.");
      const { data: round } = await db
        .from("bruh_rounds")
        .select("id,game_id,picked_team_id,reward")
        .eq("id", roundId)
        .maybeSingle();
      if (!round) return bad("Round not found.", 404);
      if (!round.picked_team_id) return bad("Nobody has been picked yet.", 409);
      // Idempotent: the board and the remote both firing must not double-score.
      if (round.reward) {
        const state = await loadGameState(db, round.game_id, "teacher");
        return Response.json(state, noStore);
      }

      const forced = text(body.rewardKey, 40);
      const reward = (forced ? rewardByKey(forced) : null) ?? drawReward();

      const { data: teams } = await db
        .from("bruh_teams")
        .select("id,name,color,score,sort_order")
        .eq("game_id", round.game_id);
      const roster = (teams ?? []) as BruhTeamRow[];
      const updates = applyReward(reward, roster, round.picked_team_id, text(body.giftTeamId, 80));

      for (const u of updates) {
        const { error } = await db.from("bruh_teams").update({ score: u.score }).eq("id", u.id);
        if (error) return bad(error.message, 500);
      }
      const { error: roundError } = await db
        .from("bruh_rounds")
        .update({ reward: { ...reward, appliedAt: new Date().toISOString() } })
        .eq("id", roundId);
      if (roundError) return bad(roundError.message, 500);

      const state = await loadGameState(db, round.game_id, "teacher");
      return Response.json(state, noStore);
    }

    case "end-round": {
      const roundId = text(body.roundId, 80);
      if (!roundId) return bad("A round is required.");
      const { data: round, error } = await db
        .from("bruh_rounds")
        .update({ phase: "done" })
        .eq("id", roundId)
        .select("game_id")
        .maybeSingle();
      if (error) return bad(error.message, 500);
      if (!round) return bad("Round not found.", 404);
      const state = await loadGameState(db, round.game_id, "teacher");
      return Response.json(state, noStore);
    }

    case "finish": {
      const gameId = text(body.gameId, 80);
      if (!gameId) return bad("A game is required.");
      const { error } = await db.from("bruh_games").update({ status: "done" }).eq("id", gameId);
      if (error) return bad(error.message, 500);
      const state = await loadGameState(db, gameId, "teacher");
      return Response.json(state, noStore);
    }

    // ---- manual override ------------------------------------------------
    case "adjust": {
      // The teacher overruling the machine: a fair answer the normalizer was too
      // strict about, or a points fix. Always available, never questioned.
      const teamId = text(body.teamId, 80);
      const delta = intIn(body.delta, -10000, 10000, 0);
      if (!teamId || !delta) return bad("A team and a non-zero amount are required.");
      const { data: team } = await db.from("bruh_teams").select("id,game_id,score").eq("id", teamId).maybeSingle();
      if (!team) return bad("Team not found.", 404);
      const { error } = await db.from("bruh_teams").update({ score: team.score + delta }).eq("id", teamId);
      if (error) return bad(error.message, 500);
      const state = await loadGameState(db, team.game_id, "teacher");
      return Response.json(state, noStore);
    }

    default:
      return bad("Unknown action.");
  }
}

/** Pure: what each team's score becomes once a card lands. */
export function applyReward(
  reward: BruhReward,
  teams: BruhTeamRow[],
  pickedTeamId: string,
  giftTeamId: string,
): { id: string; score: number }[] {
  const out: { id: string; score: number }[] = [];
  const me = teams.find((t) => t.id === pickedTeamId);
  if (!me) return out;

  if (reward.scope === "self") {
    if (reward.pts === "zero") out.push({ id: me.id, score: 0 });
    else out.push({ id: me.id, score: me.score + reward.pts });
    return out;
  }
  if (reward.scope === "others") {
    const pts = reward.pts === "zero" ? 0 : reward.pts;
    for (const t of teams) if (t.id !== me.id) out.push({ id: t.id, score: t.score + pts });
    return out;
  }
  // gift: the teacher names the recipient out loud; default to last place.
  const pts = reward.pts === "zero" ? 0 : reward.pts;
  const chosen = teams.find((t) => t.id === giftTeamId && t.id !== me.id);
  const target = chosen ?? [...teams].filter((t) => t.id !== me.id).sort((a, b) => a.score - b.score)[0];
  if (target) out.push({ id: target.id, score: target.score + pts });
  return out;
}
