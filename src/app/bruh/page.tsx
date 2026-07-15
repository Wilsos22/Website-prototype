"use client";

// BRUH — the student's laptop during the review game.
//
// Students do not navigate here; the teacher deploys the class and ClassSync
// brings them. Pick a team once, then answer. Deliberately spare: the drama is
// on the board at the front of the room, not on this screen.
//
// This page never learns whether an answer was right. The server knows, the
// board shows it, and the room finds out together.

import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredStudentSession } from "@/lib/liveClassFlow";
import { SECURE_STUDENT_DATA, studentApiRequest } from "@/lib/studentApi";
import type { BruhState } from "@/lib/bruhState";

const POLL_MS = 1000;

type Payload = (BruhState & { myTeamId: string | null }) | { game: null };

export default function BruhStudentPage() {
  const [session, setSession] = useState<{ sessionId: string; studentId: string; name: string } | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const offsetRef = useRef(0);
  const roundRef = useRef<string>("");

  useEffect(() => {
    setSession(getStoredStudentSession());
  }, []);

  // Both auth modes: with the secure flag on, studentApiRequest attaches a
  // Bearer token and the server ignores what we claim here. With it off, the
  // server checks this id against session_joins instead.
  const call = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (SECURE_STUDENT_DATA) return studentApiRequest<T>(path, init);
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { error?: string }).error || "That did not go through.");
    return body as T;
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const q = new URLSearchParams({ sessionId: session.sessionId, studentId: session.studentId });
      const next = await call<Payload>(`/api/student/bruh?${q.toString()}`);
      if ("serverNow" in next) offsetRef.current = Date.parse(next.serverNow) - Date.now();
      setData(next);
    } catch {
      /* keep the last good frame rather than blanking the screen mid-game */
    }
  }, [session, call]);

  useEffect(() => {
    if (!session) return;
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const clock = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => { window.clearInterval(poll); window.clearInterval(clock); };
  }, [session, refresh]);

  const live = data && "serverNow" in data ? data : null;
  const round = live?.round ?? null;
  const myTeamId = live?.myTeamId ?? null;
  const myTeam = live?.teams.find((t) => t.id === myTeamId) ?? null;

  // A fresh question clears the box and any stale message.
  useEffect(() => {
    if (round && roundRef.current !== round.id) {
      roundRef.current = round.id;
      setAnswer("");
      setNote("");
    }
  }, [round]);

  const serverNow = () => Date.now() + offsetRef.current;
  const secondsLeft = round && round.phase === "answering"
    ? Math.max(0, Math.ceil((Date.parse(round.ends_at) - serverNow()) / 1000))
    : 0;
  const lockLeft = myTeam?.lockedUntil
    ? Math.max(0, Math.ceil((Date.parse(myTeam.lockedUntil) - serverNow()) / 1000))
    : 0;
  void tick; // the clocks above recompute on every tick

  const pickTeam = async (teamId: string) => {
    if (!session) return;
    setBusy(true);
    try {
      await call("/api/student/bruh", {
        method: "POST",
        body: JSON.stringify({ action: "pick-team", sessionId: session.sessionId, studentId: session.studentId, teamId }),
      });
      await refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Your team could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!session || !answer.trim()) return;
    setBusy(true);
    setNote("");
    try {
      const result = await call<{ accepted: boolean; reason?: string; locked?: boolean }>("/api/student/bruh", {
        method: "POST",
        body: JSON.stringify({ action: "answer", sessionId: session.sessionId, studentId: session.studentId, answer }),
      });
      if (!result.accepted && result.reason === "already_in") setNote("Your team is already in.");
      else if (!result.accepted && result.reason === "locked") setNote("Still locked out.");
      else if (result.locked) setNote("Not that one. Locked out for a moment.");
      else setNote("Locked in.");
      setAnswer("");
      await refresh();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That did not send.");
    } finally {
      setBusy(false);
    }
  };

  const body = (() => {
    if (!session) {
      return <p className="br-msg">Join your class first, then your teacher will bring you here.</p>;
    }
    if (!live || !live.game) {
      return <p className="br-msg">Waiting for your teacher to start the game.</p>;
    }
    if (!myTeamId) {
      return (
        <div className="br-pick">
          <h2>Pick your team</h2>
          <p>You are on this team for the whole game, so choose carefully.</p>
          <div className="br-teams">
            {live.teams.map((t) => (
              <button key={t.id} className="br-team" style={{ ["--tc" as string]: t.color }}
                disabled={busy} onClick={() => void pickTeam(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (!round || round.phase !== "answering") {
      return (
        <div className="br-wait">
          <span className="br-badge" style={{ ["--tc" as string]: myTeam?.color }}>{myTeam?.name}</span>
          <p className="br-msg">{round ? "Eyes on the board." : "Waiting for the next question."}</p>
        </div>
      );
    }
    const locked = myTeam?.phase === "locked" && lockLeft > 0;
    const already = myTeam?.phase === "in";
    return (
      <div className="br-answer">
        <div className="br-top">
          <span className="br-badge" style={{ ["--tc" as string]: myTeam?.color }}>{myTeam?.name}</span>
          <span className="br-secs" data-urgent={secondsLeft <= 10}>{secondsLeft}s</span>
        </div>
        <p className="br-prompt">{round.prompt}</p>
        {already ? (
          <p className="br-state in">Answer in. Eyes on the board.</p>
        ) : locked ? (
          <p className="br-state locked">Locked out for {lockLeft}s</p>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <input
              type="text"
              value={answer}
              autoFocus
              autoComplete="off"
              inputMode="text"
              placeholder="Your answer"
              aria-label="Your answer"
              onChange={(e) => setAnswer(e.target.value)}
            />
            <button type="submit" disabled={busy || !answer.trim()}>{busy ? "Sending" : "Lock it in"}</button>
          </form>
        )}
        {note && <p className="br-note">{note}</p>}
      </div>
    );
  })();

  return (
    <main className="br-s">
      <style>{`
        .br-s { min-height:100vh; background:#0b1014; color:#f4efe4; font-family:var(--bdb-font); display:grid; place-items:center; padding:24px; }
        .br-s h2 { font-size:26px; font-weight:900; letter-spacing:-0.04em; margin:0 0 6px; }
        .br-msg { color:#64757e; font-size:16px; text-align:center; margin:0; line-height:1.5; }

        .br-pick { text-align:center; max-width:520px; }
        .br-pick p { color:#64757e; font-size:14px; margin:0 0 22px; }
        .br-teams { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:11px; }
        .br-team { padding:22px 16px; border-radius:11px; background:#131b21; border:2px solid var(--tc,#22313a); color:#f4efe4; font-size:17px; font-weight:900; letter-spacing:-0.02em; cursor:pointer; font-family:inherit; transition:background .15s, transform .15s; }
        .br-team:hover:not(:disabled) { background:var(--tc); color:#0b1014; transform:translateY(-2px); }
        .br-team:disabled { opacity:0.5; }

        .br-wait { display:grid; gap:16px; justify-items:center; }
        .br-badge { border-radius:999px; padding:6px 16px; background:var(--tc,#22313a); color:#0b1014; font-size:12px; font-weight:900; letter-spacing:0.04em; }

        .br-answer { width:min(520px,100%); display:grid; gap:16px; }
        .br-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .br-secs { font-size:22px; font-weight:900; font-variant-numeric:tabular-nums; color:#fcaf38; }
        .br-secs[data-urgent="true"] { color:#f95335; }
        .br-prompt { font-size:clamp(19px,4.6vw,27px); font-weight:800; line-height:1.25; letter-spacing:-0.02em; margin:0; }
        .br-answer form { display:grid; gap:11px; }
        .br-answer input { background:#131b21; border:2px solid #22313a; border-radius:10px; color:#f4efe4; font-family:inherit; font-size:22px; font-weight:700; padding:16px; width:100%; }
        .br-answer input:focus-visible { outline:3px solid #fcaf38; outline-offset:2px; border-color:#fcaf38; }
        .br-answer button { padding:17px; border-radius:10px; border:none; background:#fcaf38; color:#1a1206; font-size:15px; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; cursor:pointer; font-family:inherit; }
        .br-answer button:disabled { opacity:0.4; cursor:not-allowed; }
        .br-state { text-align:center; font-size:16px; font-weight:800; padding:18px; border-radius:10px; margin:0; }
        .br-state.in { background:rgba(252,175,56,.12); border:1px solid #fcaf38; color:#fcaf38; }
        .br-state.locked { background:rgba(249,83,53,.12); border:1px solid #f95335; color:#f95335; }
        .br-note { text-align:center; font-size:13px; color:#a9b6bd; margin:0; }
      `}</style>
      {body}
    </main>
  );
}
