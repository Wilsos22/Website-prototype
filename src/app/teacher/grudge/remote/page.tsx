"use client";

// Grudge Ball remote - drive the game from the iPad while the board is on the
// screen. Thin: the game lives on the server, so this is the same POSTs the board
// makes with bigger buttons. The MAKE button is the star - tap it courtside on
// every basket. Whichever surface you touch, the other catches up on its poll.

import { useCallback, useEffect, useState } from "react";
import { teacherApiRequest, teacherPost } from "@/lib/teacherApi";
import type { GrudgeState } from "@/lib/grudgeState";

const POLL_MS = 1500;

export default function GrudgeRemotePage() {
  const [gameId, setGameId] = useState("");
  const [state, setState] = useState<GrudgeState | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("game") || "";
    if (fromUrl) { setGameId(fromUrl); localStorage.setItem("bdm-grudge-game", fromUrl); return; }
    setGameId(localStorage.getItem("bdm-grudge-game") || "");
  }, []);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try { setState(await teacherApiRequest<GrudgeState>(`/api/teacher/grudge?gameId=${encodeURIComponent(gameId)}`)); }
    catch (e) { setNote(e instanceof Error ? e.message : "Could not reach the game."); }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(poll);
  }, [gameId, refresh]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setNote("");
    try { setState(await teacherPost<GrudgeState>("/api/teacher/grudge", { ...body, gameId })); }
    catch (e) { setNote(e instanceof Error ? e.message : "That did not go through."); }
    finally { setBusy(false); }
  };

  const round = state?.round ?? null;
  const phase = round?.phase ?? null;
  const eligible = (state?.teams ?? []).filter((t) => t.phase === "correct" && !t.out);
  const budget = round ? Math.max(0, round.makes - round.makes_spent) : 0;

  return (
    <main className="gr">
      <style>{`
        .gr { min-height:100vh; background:#0b0f0b; color:#eef2ea; font-family:var(--bdb-font); padding:20px; display:flex; flex-direction:column; gap:16px; }
        .gr-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .gr-head h1 { font-size:19px; font-weight:900; letter-spacing:-0.04em; margin:0; }
        .gr-phase { font-size:10px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#6b7a6b; border:1px solid #24301f; border-radius:6px; padding:6px 11px; }
        .gr-q { background:#111811; border:1px solid #24301f; border-radius:11px; padding:16px; }
        .gr-q b { font-size:17px; font-weight:800; display:block; line-height:1.3; }
        .gr-q i { font-size:11px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#6b7a6b; font-style:normal; display:block; margin-bottom:6px; }
        .gr-keys { display:grid; gap:11px; }
        .gr-key { padding:22px; border-radius:12px; border:1px solid #24301f; background:#182218; color:#eef2ea; font-size:16px; font-weight:900; letter-spacing:0.06em; text-transform:uppercase; cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent; }
        .gr-key:active { transform:scale(.98); } .gr-key:disabled { opacity:0.35; }
        .gr-key.primary { background:#f0623b; border-color:#f0623b; color:#160a06; }
        .gr-make { padding:40px; font-size:22px; background:rgba(240,98,59,.14); border:3px solid #f0623b; color:#f0623b; }
        .gr-make b { display:block; font-size:64px; line-height:1; }
        .gr-tiles { display:grid; grid-template-columns:repeat(6,1fr); gap:7px; }
        .gr-t { aspect-ratio:1; border-radius:8px; border:1px solid #24301f; background:#182218; color:#eef2ea; font-size:17px; font-weight:900; font-variant-numeric:tabular-nums; cursor:pointer; font-family:inherit; }
        .gr-t:disabled { opacity:0.25; border-style:dashed; }
        .gr-note { font-size:13px; color:#f0623b; text-align:center; margin:0; }
        .gr-empty { margin:auto; color:#6b7a6b; text-align:center; font-size:15px; line-height:1.6; } .gr-empty a { color:#f0623b; }
      `}</style>

      <div className="gr-head"><h1>Grudge remote</h1><span className="gr-phase">{phase ?? "board"}</span></div>

      {!gameId || !state ? (
        <p className="gr-empty">{note || <>No game yet. Start one from <a href="/teacher/grudge">setup</a>, then open this page again.</>}</p>
      ) : (
        <>
          {round && <div className="gr-q"><i>Question {round.question_n}</i><b>{round.prompt}</b></div>}
          <div className="gr-keys">
            {(!round || phase === "done") && (
              <div className="gr-tiles">
                {state.game.questions.map((q) => (
                  <button key={q.n} className="gr-t" disabled={busy || state.spent.includes(q.n)}
                    onClick={() => void act({ action: "open-round", questionN: q.n })}>{q.n}</button>
                ))}
              </div>
            )}
            {phase === "answering" && (
              <button className="gr-key" style={{ borderColor: "#f95335", color: "#f95335" }} disabled={busy}
                onClick={() => void act({ action: "close-round", roundId: round!.id })}>Close answers now</button>
            )}
            {phase === "reveal" && (eligible.length ? eligible.map((t) => (
              <button key={t.id} className="gr-key primary" disabled={busy} onClick={() => void act({ action: "pick-champion", roundId: round!.id, teamId: t.id })}>
                {t.name} shoots
              </button>
            )) : (
              <button className="gr-key" disabled={busy} onClick={() => void act({ action: "end-round", roundId: round!.id })}>Back to board</button>
            ))}
            {phase === "explain" && (
              <>
                <button className="gr-key primary" disabled={busy} onClick={() => void act({ action: "to-shoot", roundId: round!.id })}>To the hoop</button>
                <button className="gr-key" disabled={busy} onClick={() => void act({ action: "end-round", roundId: round!.id })}>Skip shot</button>
              </>
            )}
            {phase === "shoot" && (
              <>
                <button className="gr-key gr-make" disabled={busy} onClick={() => void act({ action: "make", roundId: round!.id })}>
                  <b>{round?.makes}</b>MAKE
                </button>
                <button className="gr-key" disabled={busy} onClick={() => void act({ action: "make", roundId: round!.id, delta: -1 })}>Undo make</button>
                <button className="gr-key primary" disabled={busy} onClick={() => void act({ action: "close-shoot", roundId: round!.id })}>Done shooting</button>
              </>
            )}
            {phase === "steal" && (
              <button className="gr-key primary" disabled={busy} onClick={() => void act({ action: "end-round", roundId: round!.id })}>
                {budget} left &mdash; back to board
              </button>
            )}
          </div>
          {note && <p className="gr-note">{note}</p>}
        </>
      )}
    </main>
  );
}
