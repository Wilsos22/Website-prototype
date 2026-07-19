"use client";

// Grudge Ball scoreboard - the read-only second screen. Polls the same game the
// board does and shows every team's X's big enough to read across the room.
// Safe to leave on a TV; nothing here can change the game.

import { useCallback, useEffect, useState } from "react";
import { teacherApiRequest } from "@/lib/teacherApi";
import type { GrudgeState } from "@/lib/grudgeState";

const POLL_MS = 2000;

export default function GrudgeScoreboardPage() {
  const [gameId, setGameId] = useState("");
  const [state, setState] = useState<GrudgeState | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("game") || "";
    if (id) setGameId(id);
    else setNote("Open the scoreboard from the board so it knows which game to show.");
  }, []);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      setState(await teacherApiRequest<GrudgeState>(`/api/teacher/grudge?gameId=${encodeURIComponent(gameId)}`));
      setNote("");
    } catch (e) { setNote(e instanceof Error ? e.message : "The game could not be read."); }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(poll);
  }, [gameId, refresh]);

  const ranked = [...(state?.teams ?? [])].sort((a, b) => b.lives - a.lives);

  return (
    <main className="gsb">
      <style>{`
        .gsb { position:fixed; inset:0; background:radial-gradient(120% 90% at 50% 0%, #121a12 0%, #0b0f0b 62%), #0b0f0b; color:#eef2ea; font-family:var(--bdb-font); padding:34px 40px; display:flex; flex-direction:column; gap:22px; }
        .gsb-head { display:flex; align-items:baseline; justify-content:space-between; gap:18px; }
        .gsb-head h1 { font-size:clamp(26px,3.4vw,44px); font-weight:900; letter-spacing:-0.05em; margin:0; }
        .gsb-head span { font-size:13px; color:#6b7a6b; font-weight:600; }
        .gsb-list { flex:1; display:flex; flex-direction:column; gap:9px; min-height:0; overflow-y:auto; }
        .gsb-row { display:grid; grid-template-columns:56px 1fr auto; align-items:center; gap:18px; padding:14px 20px; border-radius:10px; background:#111811; border:1px solid #24301f; border-left:4px solid var(--tc,#24301f); }
        .gsb-row[data-out="true"] { opacity:0.55; border-style:dashed; }
        .gsb-rank { font-size:24px; font-weight:900; font-variant-numeric:tabular-nums; color:#6b7a6b; letter-spacing:-0.04em; }
        .gsb-name { font-size:clamp(19px,2.2vw,30px); font-weight:800; letter-spacing:-0.03em; }
        .gsb-sub { font-size:11px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:#6b7a6b; }
        .gsb-score { font-size:clamp(24px,2.8vw,38px); font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; color:var(--tc); }
        .gsb-row[data-lead="true"] { background:rgba(240,98,59,.11); border-color:#f0623b; }
        .gsb-pips { grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:4px; }
        .gsb-pips i { width:14px; height:14px; border-radius:3px; background:var(--tc,#f0623b); }
        .gsb-note { color:#6b7a6b; font-size:15px; margin:auto; }
      `}</style>

      <div className="gsb-head">
        <h1>Grudge Ball</h1>
        {state && <span>{state.spent.length} of {state.game.questions.length} played</span>}
      </div>

      {!state ? <p className="gsb-note">{note || "Loading."}</p> : (
        <div className="gsb-list">
          {ranked.map((t, i) => (
            <div key={t.id} className="gsb-row" data-lead={i === 0 && t.lives > 0} data-out={t.out} style={{ ["--tc" as string]: t.color }}>
              <span className="gsb-rank">{i + 1}</span>
              <span className="gsb-name">{t.name} {t.out && <span className="gsb-sub">&middot; out, {t.wins_while_out}/{state.game.revive_wins} back</span>}</span>
              <span className="gsb-score">{t.lives}</span>
              <span className="gsb-pips">{Array.from({ length: Math.max(t.lives, 0) }, (_, k) => <i key={k} />)}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
