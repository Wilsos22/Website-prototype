// The persistent second-screen scoreboard feed.
//
// One endpoint that answers "what game is on right now?" across BOTH games, so
// the panel in the room can be opened once and left up all day. It follows
// whatever is running - start a BRUH game and it shows BRUH; start Grudge Ball
// later and it switches itself.
//
// Gated by src/proxy.ts via the existing /api/teacher prefix.

import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { loadGameState as loadBruh } from "@/lib/bruhState";
import { loadGameState as loadGrudge } from "@/lib/grudgeState";

export const dynamic = "force-dynamic";

const noStore = { headers: { "cache-control": "no-store" } };

export async function GET() {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  // Scope to open sessions. A game whose session has been closed is over, so the
  // panel should go idle rather than keep showing yesterday's scores.
  const { data: openSessions } = await db.from("sessions").select("id").eq("status", "open");
  const sessionIds = (openSessions ?? []).map((s) => s.id);
  if (!sessionIds.length) return Response.json({ kind: null }, noStore);

  // Most recent game of each kind. Status is deliberately NOT filtered: a game
  // the teacher just finished should keep its final standings on the panel until
  // the next one starts or the session closes.
  const [bruhRes, grudgeRes] = await Promise.all([
    db.from("bruh_games").select("id,created_at").in("session_id", sessionIds)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("grudge_games").select("id,created_at").in("session_id", sessionIds)
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const bruh = bruhRes.data;
  const grudge = grudgeRes.data;
  if (!bruh && !grudge) return Response.json({ kind: null }, noStore);

  // Whichever was started most recently is the one on the floor.
  const useGrudge = !bruh || (grudge && Date.parse(grudge.created_at) > Date.parse(bruh.created_at));

  if (useGrudge && grudge) {
    const state = await loadGrudge(db, grudge.id, "teacher");
    return state
      ? Response.json({ kind: "grudge", state }, noStore)
      : Response.json({ kind: null }, noStore);
  }
  if (bruh) {
    const state = await loadBruh(db, bruh.id, "teacher");
    return state
      ? Response.json({ kind: "bruh", state }, noStore)
      : Response.json({ kind: null }, noStore);
  }
  return Response.json({ kind: null }, noStore);
}
