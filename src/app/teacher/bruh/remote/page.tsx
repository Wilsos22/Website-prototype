"use client";

// BRUH remote — drive the game from the iPad while the board is on the screen.
//
// Thin on purpose. The game lives on the server, so this is the same POSTs the
// board makes with bigger buttons and no theatre. Whichever surface you touch,
// the other catches up on its next poll.
//
// Log in once on the iPad (the teacher cookie lasts about six months) and this
// page works from anywhere in the room.

import { useCallback, useEffect, useState } from "react";
import { teacherApiRequest, teacherPost } from "@/lib/teacherApi";
import type { BruhState } from "@/lib/bruhState";

const POLL_MS = 1500;

export default function BruhRemotePage() {
  const [gameId, setGameId] = useState("");
  const [state, setState] = useState<BruhState | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("game") || "";
    if (fromUrl) { setGameId(fromUrl); localStorage.setItem("bdm-bruh-game", fromUrl); return; }
    // Remember the last game so the iPad can be picked up mid-lesson without
    // fishing the id out of the board's URL.
    setGameId(localStorage.getItem("bdm-bruh-game") || "");
  }, []);

  const refresh = useCallback(async () => {
    if (!gameId) return;
    try {
      setState(await teacherApiRequest<BruhState>(`/api/teacher/bruh?gameId=${encodeURIComponent(gameId)}`));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not reach the game.");
    }
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(poll);
  }, [gameId, refresh]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setNote("");
    try {
      setState(await teacherPost<BruhState>("/api/teacher/bruh", { ...body, gameId }));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  };

  const round = state?.round ?? null;
  const phase = round?.phase ?? null;
  const correct = (state?.teams ?? []).filter((t) => t.phase === "correct");

  return (
    <main className="br-rm">
      <style>{`
        .br-rm { min-height:100vh; background:#0b1014; color:#f4efe4; font-family:var(--bdb-font); padding:20px; display:flex; flex-direction:column; gap:16px; }
        .br-rmhead { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .br-rmhead h1 { font-size:19px; font-weight:900; letter-spacing:-0.04em; margin:0; }
        .br-rmphase { font-size:10px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#64757e; border:1px solid #22313a; border-radius:6px; padding:6px 11px; }
        .br-rmq { background:#131b21; border:1px solid #22313a; border-radius:11px; padding:16px; }
        .br-rmq b { font-size:17px; font-weight:800; display:block; line-height:1.3; }
        .br-rmq i { font-size:11px; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:#64757e; font-style:normal; display:block; margin-bottom:6px; }
        .br-keys { display:grid; gap:11px; }
        .br-key { padding:22px; border-radius:12px; border:1px solid #22313a; background:#18232b; color:#f4efe4; font-size:16px; font-weight:900; letter-spacing:0.06em; text-transform:uppercase; cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent; }
        .br-key:active { transform:scale(.98); }
        .br-key:disabled { opacity:0.35; }
        .br-key.primary { background:#fcaf38; border-color:#fcaf38; color:#1a1206; }
        .br-key.warn { border-color:#f95335; color:#f95335; }
        .br-tiles { display:grid; grid-template-columns:repeat(6,1fr); gap:7px; }
        .br-t { aspect-ratio:1; border-radius:8px; border:1px solid #22313a; background:#18232b; color:#f4efe4; font-size:17px; font-weight:900; font-variant-numeric:tabular-nums; cursor:pointer; font-family:inherit; }
        .br-t:disabled { opacity:0.25; border-style:dashed; }
        .br-rmnote { font-size:13px; color:#fcaf38; text-align:center; margin:0; }
        .br-rmempty { margin:auto; color:#64757e; text-align:center; font-size:15px; line-height:1.6; }
        .br-rmempty a { color:#fcaf38; }
      `}</style>

      <div className="br-rmhead">
        <h1>BRUH remote</h1>
        <span className="br-rmphase">{phase ?? "board"}</span>
      </div>

      {!gameId || !state ? (
        <p className="br-rmempty">
          {note || <>No game yet. Start one from <a href="/teacher/bruh">setup</a>, then open this page again.</>}
        </p>
      ) : (
        <>
          {round && (
            <div className="br-rmq">
              <i>Question {round.question_n}</i>
              <b>{round.prompt}</b>
            </div>
          )}

          <div className="br-keys">
            {(!round || phase === "done") && (
              <div className="br-tiles">
                {state.game.questions.map((q) => (
                  <button key={q.n} className="br-t" disabled={busy || state.spent.includes(q.n)}
                    onClick={() => void act({ action: "open-round", questionN: q.n })}>
                    {q.n}
                  </button>
                ))}
              </div>
            )}
            {phase === "answering" && (
              <button className="br-key warn" disabled={busy} onClick={() => void act({ action: "close-round", roundId: round!.id })}>
                Close answers now
              </button>
            )}
            {phase === "reveal" && (
              <>
                <button className="br-key primary" disabled={busy || !correct.length}
                  onClick={() => void act({ action: "pick", roundId: round!.id })}>
                  {correct.length ? "Pick who explains" : "Nobody got it"}
                </button>
                <button className="br-key" disabled={busy} onClick={() => void act({ action: "end-round", roundId: round!.id })}>
                  Back to board
                </button>
              </>
            )}
            {phase === "spotlight" && (
              <>
                <button className="br-key primary" disabled={busy} onClick={() => void act({ action: "to-board", roundId: round!.id })}>
                  Send them up
                </button>
                <button className="br-key" disabled={busy} onClick={() => void act({ action: "pick", roundId: round!.id })}>
                  Pick someone else
                </button>
              </>
            )}
            {phase === "explain" && (
              <>
                <button className="br-key primary" disabled={busy} onClick={() => void act({ action: "to-reward", roundId: round!.id })}>
                  Explanation accepted
                </button>
                <button className="br-key" disabled={busy} onClick={() => void act({ action: "pick", roundId: round!.id })}>
                  Pick someone else
                </button>
              </>
            )}
            {phase === "reward" && (
              <>
                {!round?.reward ? (
                  <button className="br-key primary" disabled={busy} onClick={() => void act({ action: "draw", roundId: round!.id })}>
                    Pull the slot
                  </button>
                ) : (
                  <button className="br-key primary" disabled={busy} onClick={() => void act({ action: "end-round", roundId: round!.id })}>
                    Back to board
                  </button>
                )}
              </>
            )}
          </div>

          {note && <p className="br-rmnote">{note}</p>}
        </>
      )}
    </main>
  );
}
