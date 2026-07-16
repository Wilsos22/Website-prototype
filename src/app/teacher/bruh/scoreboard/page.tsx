"use client";

// BRUH scoreboard — the second screen.
//
// Read-only by design: it polls the same game the board does and renders the
// standings big enough to read from anywhere in the room. Nothing here can
// change the game, so it is safe to leave on a TV.

import { useCallback, useEffect, useState } from "react";
import { teacherApiRequest } from "@/lib/teacherApi";
import type { BruhState } from "@/lib/bruhState";

const POLL_MS = 2000;

export default function BruhScoreboardPage() {
  const [gameId, setGameId] = useState("");
  const [state, setState] = useState<BruhState | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("game") || "";
    if (id) { setGameId(id); return; }
    // No game in the URL: fall back to the most recent live one so the screen
    // can be opened cold, without copying an id around.
    void (async () => {
      try {
        const result = await teacherApiRequest<{ sessions: { id: string; status: string }[] }>("/api/teacher/session");
        const open = (result.sessions ?? []).find((s) => s.status === "open");
        if (!open) { setNote("No open class session."); return; }
        setNote("Open the scoreboard from the board so it knows which game to show.");
      } catch {
        setNote("Could not reach the server.");
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      setState(await teacherApiRequest<BruhState>(`/api/teacher/bruh?gameId=${encodeURIComponent(gameId)}`));
      setNote("");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The game could not be read.");
    }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(poll);
  }, [gameId, refresh]);

  const ranked = [...(state?.teams ?? [])].sort((a, b) => b.score - a.score);
  const top = Math.max(1, ...ranked.map((t) => Math.abs(t.score)));

  return (
    <main className="br-sb">
      <style>{`
        .br-sb { position:fixed; inset:0; background:radial-gradient(120% 90% at 50% 0%, #0e161c 0%, #0b1014 62%), #0b1014; color:#f4efe4; font-family:var(--bdb-font); padding:34px 40px; display:flex; flex-direction:column; gap:22px; }
        .br-sbhead { display:flex; align-items:baseline; justify-content:space-between; gap:18px; }
        .br-sbhead h1 { font-size:clamp(26px,3.4vw,44px); font-weight:900; letter-spacing:-0.05em; margin:0; }
        .br-sbhead span { font-size:13px; color:#64757e; font-weight:600; }
        .br-sblist { flex:1; display:flex; flex-direction:column; gap:9px; min-height:0; overflow-y:auto; }
        .br-sbrow { display:grid; grid-template-columns:56px 1fr auto; align-items:center; gap:18px; padding:14px 20px; border-radius:10px; background:#131b21; border:1px solid #22313a; border-left:4px solid var(--tc,#22313a); transition:transform .5s cubic-bezier(.16,1,.3,1), background .3s; }
        .br-sbrank { font-size:24px; font-weight:900; font-variant-numeric:tabular-nums; color:#64757e; letter-spacing:-0.04em; }
        .br-sbname { font-size:clamp(19px,2.2vw,30px); font-weight:800; letter-spacing:-0.03em; }
        .br-sbscore { font-size:clamp(24px,2.8vw,38px); font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; }
        .br-sbrow[data-lead="true"] { background:rgba(252,175,56,.11); border-color:#fcaf38; }
        .br-sbrow[data-lead="true"] .br-sbrank, .br-sbrow[data-lead="true"] .br-sbscore { color:#fcaf38; }
        .br-sbbar { grid-column:1 / -1; height:4px; background:#1a262e; overflow:hidden; border-radius:2px; }
        .br-sbbar i { display:block; height:100%; background:var(--tc,#fcaf38); transition:width .7s cubic-bezier(.16,1,.3,1); }
        .br-sbnote { color:#64757e; font-size:15px; margin:auto; }
      `}</style>

      <div className="br-sbhead">
        <h1>Scoreboard</h1>
        {state && <span>{state.spent.length} of {state.game.questions.length} played</span>}
      </div>

      {!state ? (
        <p className="br-sbnote">{note || "Loading."}</p>
      ) : (
        <div className="br-sblist">
          {ranked.map((t, i) => (
            <div key={t.id} className="br-sbrow" data-lead={i === 0 && t.score > 0} style={{ ["--tc" as string]: t.color }}>
              <span className="br-sbrank">{i + 1}</span>
              <span className="br-sbname">{t.name}</span>
              <span className="br-sbscore">{t.score}</span>
              <span className="br-sbbar"><i style={{ width: `${Math.max(0, (t.score / top) * 100)}%` }} /></span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
