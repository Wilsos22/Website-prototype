// Teacher control for Grudge Ball. Gated by src/proxy.ts via /api/teacher.
//
// The referee. Board, iPad remote and interactive panel all POST actions here and
// re-render whatever comes back, so any of them can drive the game and none can
// disagree. Question banks are shared with BRUH (bruh_sets) - a set authored once
// works in either game.

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { parseBank, pickVocab, teamColor } from "@/lib/bruhGame";
import { applyErase, applyRevive, reviveReady, type GrudgeScorable } from "@/lib/grudgeGame";
import { loadGameState, type GrudgeTeamRow } from "@/lib/grudgeState";

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

  // No gameId: the setup page asking for the shared banks.
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
    // ---- shared question banks -----------------------------------------
    case "save-set": {
      const name = text(body.name, 120);
      const questions = Array.isArray(body.questions) ? body.questions : null;
      if (!name || !questions?.length) return bad("A named set with at least one question is required.");
      const id = text(body.id, 80);
      if (id) {
        const { data, error } = await db.from("bruh_sets")
          .update({ name, questions, updated_at: new Date().toISOString() })
          .eq("id", id).select("id,name,questions,updated_at").maybeSingle();
        if (error) return bad(error.message, 500);
        return Response.json({ set: data }, noStore);
      }
      const { data, error } = await db.from("bruh_sets")
        .insert({ name, questions }).select("id,name,questions,updated_at").maybeSingle();
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

    // ---- launch --------------------------------------------------------
    case "launch": {
      const sessionId = text(body.sessionId, 80);
      const raw = Array.isArray(body.questions) ? body.questions : null;
      // Accept either structured questions or a pasted bank string.
      const questions = raw ?? (typeof body.bankText === "string" ? parseBank(body.bankText).questions : null);
      const teamNames = Array.isArray(body.teams) ? body.teams.map((t) => text(t, 40)).filter(Boolean) : [];
      if (!sessionId) return bad("Start a class session first.");
      if (!questions?.length) return bad("A question bank is required.");
      if (teamNames.length < 2) return bad("Name at least two teams.");
      const startingLives = intIn(body.startingLives, 1, 99, 10);

      const { data: game, error } = await db.from("grudge_games").insert({
        session_id: sessionId,
        set_name: text(body.setName, 120) || null,
        questions,
        answer_seconds: intIn(body.answerSeconds, 5, 600, 120),
        lockout_seconds: intIn(body.lockoutSeconds, 0, 300, 20),
        explain_seconds: intIn(body.explainSeconds, 15, 600, 120),
        shoot_seconds: intIn(body.shootSeconds, 5, 120, 30),
        starting_lives: startingLives,
        revive_wins: intIn(body.reviveWins, 1, 10, 2),
        revive_lives: intIn(body.reviveLives, 1, 20, 3),
        status: "playing",
      }).select("id").maybeSingle();
      if (error || !game) return bad(error?.message ?? "The game could not be started.", 500);

      const { error: teamError } = await db.from("grudge_teams").insert(
        teamNames.map((name, i) => ({ game_id: game.id, name, color: teamColor(i), lives: startingLives, sort_order: i })),
      );
      if (teamError) return bad(teamError.message, 500);

      return Response.json(await loadGameState(db, game.id, "teacher"), noStore);
    }

    // ---- the round loop ------------------------------------------------
    case "open-round": {
      const gameId = text(body.gameId, 80);
      const n = intIn(body.questionN, 1, 999, 0);
      if (!gameId || !n) return bad("A game and question number are required.");
      const { data: game } = await db.from("grudge_games")
        .select("id,questions,answer_seconds").eq("id", gameId).maybeSingle();
      if (!game) return bad("Game not found.", 404);
      const questions = game.questions as { n: number; topic: string; q: string; a: string }[];
      const q = questions.find((x) => x.n === n);
      if (!q) return bad("That question is not in this game.", 404);

      const { data: already } = await db.from("grudge_rounds")
        .select("id").eq("game_id", gameId).eq("question_n", n).maybeSingle();
      if (already) return bad("That question has already been played.", 409);

      const endsAt = new Date(Date.now() + game.answer_seconds * 1000).toISOString();
      const { data: round, error } = await db.from("grudge_rounds").insert({
        game_id: gameId, question_n: n, topic: q.topic, prompt: q.q, correct_answer: q.a,
        phase: "answering", ends_at: endsAt, vocab: pickVocab(q.topic ?? "", q.q ?? ""),
      }).select("id").maybeSingle();
      if (error || !round) return bad(error?.message ?? "The round could not be opened.", 500);
      return Response.json(await loadGameState(db, gameId, "teacher"), noStore);
    }

    case "close-round": {
      const roundId = text(body.roundId, 80);
      if (!roundId) return bad("A round is required.");
      const { data: round, error } = await db.from("grudge_rounds")
        .update({ phase: "reveal", ends_at: new Date().toISOString() })
        .eq("id", roundId).eq("phase", "answering").select("id,game_id").maybeSingle();
      if (error) return bad(error.message, 500);
      if (!round) {
        const gameId = text(body.gameId, 80);
        const state = gameId ? await loadGameState(db, gameId, "teacher") : null;
        return state ? Response.json(state, noStore) : bad("Round not found.", 404);
      }
      // Credit a "win while out" to any out team that got this one right - progress
      // toward their comeback. Done once, here, as the window closes.
      await creditWinsWhileOut(db, round.id, round.game_id);
      return Response.json(await loadGameState(db, round.game_id, "teacher"), noStore);
    }

    case "pick-champion": {
      // Teacher taps one correct, NOT-out team to shoot. Out teams answer but do
      // not shoot; if every correct team is out, there is no champion this round.
      const roundId = text(body.roundId, 80);
      const teamId = text(body.teamId, 80);
      if (!roundId || !teamId) return bad("A round and a team are required.");
      const { data: round } = await db.from("grudge_rounds")
        .select("id,game_id").eq("id", roundId).maybeSingle();
      if (!round) return bad("Round not found.", 404);

      const { data: correct } = await db.from("grudge_answers")
        .select("team_id").eq("round_id", roundId).eq("is_correct", true);
      const correctIds = new Set((correct ?? []).map((r) => r.team_id));
      if (!correctIds.has(teamId)) return bad("That team did not get it right.", 409);

      const { data: team } = await db.from("grudge_teams").select("id,out").eq("id", teamId).maybeSingle();
      if (!team) return bad("Team not found.", 404);
      if (team.out) return bad("An out team cannot shoot. Revive them first.", 409);

      const { data: game } = await db.from("grudge_games")
        .select("explain_seconds").eq("id", round.game_id).maybeSingle();
      const secs = game?.explain_seconds ?? 120;
      const { error } = await db.from("grudge_rounds").update({
        phase: "explain", champion_team_id: teamId,
        explain_ends_at: new Date(Date.now() + secs * 1000).toISOString(),
      }).eq("id", roundId);
      if (error) return bad(error.message, 500);
      return Response.json(await loadGameState(db, round.game_id, "teacher"), noStore);
    }

    case "to-shoot": {
      const roundId = text(body.roundId, 80);
      if (!roundId) return bad("A round is required.");
      const { data: round } = await db.from("grudge_rounds")
        .select("id,game_id,champion_team_id").eq("id", roundId).maybeSingle();
      if (!round) return bad("Round not found.", 404);
      if (!round.champion_team_id) return bad("Pick a team to shoot first.", 409);
      const { data: game } = await db.from("grudge_games")
        .select("shoot_seconds").eq("id", round.game_id).maybeSingle();
      const secs = game?.shoot_seconds ?? 30;
      const { error } = await db.from("grudge_rounds")
        .update({ phase: "shoot", shoot_ends_at: new Date(Date.now() + secs * 1000).toISOString() })
        .eq("id", roundId);
      if (error) return bad(error.message, 500);
      return Response.json(await loadGameState(db, round.game_id, "teacher"), noStore);
    }

    case "make": {
      // A teammate taps this per basket during the shoot window. Small race
      // window between board and remote, so add via a fresh read.
      const roundId = text(body.roundId, 80);
      const delta = intIn(body.delta, -1, 1, 1) || 1;
      if (!roundId) return bad("A round is required.");
      const { data: round } = await db.from("grudge_rounds")
        .select("id,game_id,phase,makes").eq("id", roundId).maybeSingle();
      if (!round) return bad("Round not found.", 404);
      if (round.phase !== "shoot") return bad("The shooting window is not open.", 409);
      const makes = Math.max(0, round.makes + delta);
      const { error } = await db.from("grudge_rounds").update({ makes }).eq("id", roundId);
      if (error) return bad(error.message, 500);
      return Response.json(await loadGameState(db, round.game_id, "teacher"), noStore);
    }

    case "close-shoot": {
      const roundId = text(body.roundId, 80);
      if (!roundId) return bad("A round is required.");
      const { data: round, error } = await db.from("grudge_rounds")
        .update({ phase: "steal" }).eq("id", roundId).eq("phase", "shoot")
        .select("id,game_id").maybeSingle();
      if (error) return bad(error.message, 500);
      if (!round) {
        const gameId = text(body.gameId, 80);
        const state = gameId ? await loadGameState(db, gameId, "teacher") : null;
        return state ? Response.json(state, noStore) : bad("Round not found.", 404);
      }
      return Response.json(await loadGameState(db, round.game_id, "teacher"), noStore);
    }

    // ---- the steal: one tap = knock one X off a target -----------------
    case "erase": {
      const roundId = text(body.roundId, 80);
      const targetId = text(body.targetId, 80);
      if (!roundId || !targetId) return bad("A round and a target are required.");
      const { data: round } = await db.from("grudge_rounds")
        .select("id,game_id,phase,champion_team_id,makes,makes_spent,steals")
        .eq("id", roundId).maybeSingle();
      if (!round) return bad("Round not found.", 404);
      if (round.phase !== "steal") return bad("It is not the steal step.", 409);
      if (!round.champion_team_id) return bad("There is no champion this round.", 409);
      if (round.makes_spent >= round.makes) return bad("No baskets left to spend.", 409);

      const { data: target } = await db.from("grudge_teams")
        .select("id,game_id,lives,out,wins_while_out,nemesis_team_id")
        .eq("id", targetId).maybeSingle();
      if (!target || target.game_id !== round.game_id) return bad("Target not found.", 404);

      const res = applyErase(target as unknown as GrudgeScorable, round.champion_team_id);
      if (!res.ok) {
        const msg = res.reason === "immune" ? "That team is already out - they are safe."
          : res.reason === "self" ? "You cannot erase your own X's." : "Target not found.";
        return bad(msg, 409);
      }
      const { error: tErr } = await db.from("grudge_teams")
        .update({ lives: res.update.lives, out: res.update.out, nemesis_team_id: res.update.nemesis_team_id })
        .eq("id", targetId);
      if (tErr) return bad(tErr.message, 500);

      const steals = Array.isArray(round.steals) ? round.steals : [];
      steals.push({ from: round.champion_team_id, to: targetId, at: new Date().toISOString() });
      const { error: rErr } = await db.from("grudge_rounds")
        .update({ makes_spent: round.makes_spent + 1, steals }).eq("id", roundId);
      if (rErr) return bad(rErr.message, 500);
      return Response.json(await loadGameState(db, round.game_id, "teacher"), noStore);
    }

    // ---- back with a grudge --------------------------------------------
    case "revive": {
      // An out team that banked enough wins comes back, taking its comeback X's
      // from its nemesis (default) or a tapped source. Standalone: the teacher
      // fires it whenever the board flags the team ready.
      const teamId = text(body.teamId, 80);
      if (!teamId) return bad("A team is required.");
      const { data: reviving } = await db.from("grudge_teams")
        .select("id,game_id,lives,out,wins_while_out,nemesis_team_id").eq("id", teamId).maybeSingle();
      if (!reviving) return bad("Team not found.", 404);
      const { data: game } = await db.from("grudge_games")
        .select("revive_wins,revive_lives").eq("id", reviving.game_id).maybeSingle();
      if (!game) return bad("Game not found.", 404);
      if (!reviveReady(reviving as unknown as GrudgeScorable, game.revive_wins)) {
        return bad("That team has not earned a comeback yet.", 409);
      }

      const sourceId = text(body.sourceId, 80) || reviving.nemesis_team_id || "";
      let source: GrudgeScorable | null = null;
      if (sourceId && sourceId !== teamId) {
        const { data: s } = await db.from("grudge_teams")
          .select("id,game_id,lives,out,wins_while_out,nemesis_team_id").eq("id", sourceId).maybeSingle();
        if (s && s.game_id === reviving.game_id) source = s as unknown as GrudgeScorable;
      }

      const out = applyRevive(reviving as unknown as GrudgeScorable, source, game.revive_lives);
      const { error: rErr } = await db.from("grudge_teams").update({
        lives: out.reviving.lives, out: out.reviving.out,
        wins_while_out: out.reviving.wins_while_out, nemesis_team_id: out.reviving.nemesis_team_id,
      }).eq("id", teamId);
      if (rErr) return bad(rErr.message, 500);
      if (out.source) {
        const { error: sErr } = await db.from("grudge_teams").update({
          lives: out.source.lives, out: out.source.out, nemesis_team_id: out.source.nemesis_team_id,
        }).eq("id", out.source.id);
        if (sErr) return bad(sErr.message, 500);
      }
      return Response.json(await loadGameState(db, reviving.game_id, "teacher"), noStore);
    }

    case "end-round": {
      const roundId = text(body.roundId, 80);
      if (!roundId) return bad("A round is required.");
      const { data: round, error } = await db.from("grudge_rounds")
        .update({ phase: "done" }).eq("id", roundId).select("game_id").maybeSingle();
      if (error) return bad(error.message, 500);
      if (!round) return bad("Round not found.", 404);
      return Response.json(await loadGameState(db, round.game_id, "teacher"), noStore);
    }

    case "finish": {
      const gameId = text(body.gameId, 80);
      if (!gameId) return bad("A game is required.");
      const { error } = await db.from("grudge_games").update({ status: "done" }).eq("id", gameId);
      if (error) return bad(error.message, 500);
      return Response.json(await loadGameState(db, gameId, "teacher"), noStore);
    }

    // ---- manual override -----------------------------------------------
    case "adjust": {
      const teamId = text(body.teamId, 80);
      const delta = intIn(body.delta, -99, 99, 0);
      if (!teamId || !delta) return bad("A team and a non-zero amount are required.");
      const { data: team } = await db.from("grudge_teams")
        .select("id,game_id,lives,out").eq("id", teamId).maybeSingle();
      if (!team) return bad("Team not found.", 404);
      const lives = Math.max(0, team.lives + delta);
      const { error } = await db.from("grudge_teams")
        .update({ lives, out: lives <= 0 }).eq("id", teamId);
      if (error) return bad(error.message, 500);
      return Response.json(await loadGameState(db, team.game_id, "teacher"), noStore);
    }

    default:
      return bad("Unknown action.");
  }
}

/** Increment wins_while_out for every out team that answered this round correctly. */
async function creditWinsWhileOut(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  roundId: string,
  gameId: string,
): Promise<void> {
  const { data: correct } = await db.from("grudge_answers")
    .select("team_id").eq("round_id", roundId).eq("is_correct", true);
  const correctIds = new Set((correct ?? []).map((r) => r.team_id));
  if (!correctIds.size) return;
  const { data: teams } = await db.from("grudge_teams")
    .select("id,out,wins_while_out").eq("game_id", gameId);
  for (const t of (teams ?? []) as Pick<GrudgeTeamRow, "id" | "out" | "wins_while_out">[]) {
    if (t.out && correctIds.has(t.id)) {
      await db.from("grudge_teams").update({ wins_while_out: t.wins_while_out + 1 }).eq("id", t.id);
    }
  }
}
