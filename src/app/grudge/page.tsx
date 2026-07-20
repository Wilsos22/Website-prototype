"use client";

// Grudge Ball - the student's laptop. Students don't navigate here; the teacher
// deploys the class and ClassSync brings them. Pick a team once, then answer.
// Spare by design: the drama (shooting, stealing) is on the board up front.
// This page never learns whether an answer was right.

import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredStudentSession } from "@/lib/liveClassFlow";
import { SECURE_STUDENT_DATA, studentApiRequest } from "@/lib/studentApi";
import type { GrudgeState } from "@/lib/grudgeState";

const POLL_MS = 1000;
type Payload = (GrudgeState & { myTeamId: string | null }) | { game: null };

export default function GrudgeStudentPage() {
  const [session, setSession] = useState<{ sessionId: string; studentId: string; name: string } | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const offsetRef = useRef(0);
  const roundRef = useRef("");

  useEffect(() => { setSession(getStoredStudentSession()); }, []);

  const call = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    if (SECURE_STUDENT_DATA) return studentApiRequest<T>(path, init);
    const res = await fetch(path, {
      ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { error?: string }).error || "That did not go through.");
    return body as T;
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const q = new URLSearchParams({ sessionId: session.sessionId, studentId: session.studentId });
      const next = await call<Payload>(`/api/student/grudge?${q.toString()}`);
      if ("serverNow" in next) offsetRef.current = Date.parse(next.serverNow) - Date.now();
      setData(next);
    } catch { /* keep last good frame */ }
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

  useEffect(() => {
    if (round && roundRef.current !== round.id) { roundRef.current = round.id; setAnswer(""); setNote(""); }
  }, [round]);

  const serverNow = () => Date.now() + offsetRef.current;
  const secondsLeft = round && round.phase === "answering"
    ? Math.max(0, Math.ceil((Date.parse(round.ends_at) - serverNow()) / 1000)) : 0;
  const lockLeft = myTeam?.lockedUntil
    ? Math.max(0, Math.ceil((Date.parse(myTeam.lockedUntil) - serverNow()) / 1000)) : 0;
  void tick;

  const pickTeam = async (teamId: string) => {
    if (!session) return;
    setBusy(true);
    try {
      await call("/api/student/grudge", { method: "POST", body: JSON.stringify({ action: "pick-team", sessionId: session.sessionId, studentId: session.studentId, teamId }) });
      await refresh();
    } catch (e) { setNote(e instanceof Error ? e.message : "Your team could not be saved."); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!session || !answer.trim()) return;
    setBusy(true); setNote("");
    try {
      const result = await call<{ accepted: boolean; reason?: string; locked?: boolean }>("/api/student/grudge", {
        method: "POST", body: JSON.stringify({ action: "answer", sessionId: session.sessionId, studentId: session.studentId, answer }),
      });
      if (!result.accepted && result.reason === "already_in") setNote("Your team is already in.");
      else if (!result.accepted && result.reason === "locked") setNote("Still locked out.");
      else if (result.locked) setNote("Not that one. Locked out for a moment.");
      else setNote("Locked in.");
      setAnswer(""); await refresh();
    } catch (e) { setNote(e instanceof Error ? e.message : "That did not send."); }
    finally { setBusy(false); }
  };

  const body = (() => {
    if (!session) return <p className="gs-msg">Join your class first, then your teacher will bring you here.</p>;
    if (!live || !live.game) return <p className="gs-msg">Waiting for your teacher to start the game.</p>;
    if (!myTeamId) {
      return (
        <div className="gs-pick">
          <h2>Pick your team</h2>
          <p>You are on this team for the whole game, so choose carefully.</p>
          <div className="gs-teams">
            {live.teams.map((t) => (
              <button key={t.id} className="gs-team" style={{ ["--tc" as string]: t.color }} disabled={busy} onClick={() => void pickTeam(t.id)}>{t.name}</button>
            ))}
          </div>
        </div>
      );
    }
    const out = myTeam?.out;
    if (!round || round.phase !== "answering") {
      return (
        <div className="gs-wait">
          <span className="gs-badge" style={{ ["--tc" as string]: myTeam?.color }}>{myTeam?.name} &middot; {myTeam?.lives} X&apos;s</span>
          <p className="gs-msg">{out ? "You are out of the shooting - but keep answering. Two wins and you are back with a grudge." : round ? "Eyes on the board." : "Waiting for the next question."}</p>
        </div>
      );
    }
    const locked = myTeam?.phase === "locked" && lockLeft > 0;
    const already = myTeam?.phase === "in";
    return (
      <div className="gs-answer">
        <div className="gs-top">
          <span className="gs-badge" style={{ ["--tc" as string]: myTeam?.color }}>{myTeam?.name} &middot; {myTeam?.lives} X&apos;s</span>
          <span className="gs-secs" data-urgent={secondsLeft <= 10}>{secondsLeft}s</span>
        </div>
        {out && <p className="gs-hint">Out of the shooting - a right answer here is a win toward your comeback.</p>}
        <p className="gs-prompt">{round.prompt}</p>
        {already ? <p className="gs-state in">Answer in. Eyes on the board.</p>
          : locked ? <p className="gs-state locked">Locked out for {lockLeft}s</p>
          : (
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <input type="text" value={answer} autoFocus autoComplete="off" placeholder="Your answer" aria-label="Your answer" onChange={(e) => setAnswer(e.target.value)} />
              <button type="submit" disabled={busy || !answer.trim()}>{busy ? "Sending" : "Lock it in"}</button>
            </form>
          )}
        {note && <p className="gs-note">{note}</p>}
      </div>
    );
  })();

  return (
    <main className="gs">
      <style>{`
        .gs { min-height:100vh; background:#0b0f0b; color:#eef2ea; font-family:var(--bdb-font); display:grid; place-items:center; padding:24px; }
        .gs h2 { font-size:26px; font-weight:900; letter-spacing:-0.04em; margin:0 0 6px; }
        .gs-msg { color:#6b7a6b; font-size:16px; text-align:center; margin:0; line-height:1.5; }
        .gs-pick { text-align:center; max-width:520px; } .gs-pick p { color:#6b7a6b; font-size:14px; margin:0 0 22px; }
        .gs-teams { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:11px; }
        .gs-team { padding:22px 16px; border-radius:11px; background:#111811; border:2px solid var(--tc,#24301f); color:#eef2ea; font-size:17px; font-weight:900; letter-spacing:-0.02em; cursor:pointer; font-family:inherit; transition:background .15s, transform .15s; }
        .gs-team:hover:not(:disabled) { background:var(--tc); color:#0b0f0b; transform:translateY(-2px); } .gs-team:disabled { opacity:0.5; }
        .gs-wait { display:grid; gap:16px; justify-items:center; }
        .gs-badge { border-radius:999px; padding:6px 16px; background:var(--tc,#24301f); color:#0b0f0b; font-size:12px; font-weight:900; letter-spacing:0.04em; }
        .gs-answer { width:min(520px,100%); display:grid; gap:16px; }
        .gs-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .gs-secs { font-size:22px; font-weight:900; font-variant-numeric:tabular-nums; color:#f0623b; } .gs-secs[data-urgent="true"] { color:#f95335; }
        .gs-hint { font-size:12px; color:#9db09d; margin:0; text-align:center; }
        .gs-prompt { font-size:clamp(19px,4.6vw,27px); font-weight:800; line-height:1.25; letter-spacing:-0.02em; margin:0; }
        .gs-answer form { display:grid; gap:11px; }
        .gs-answer input { background:#111811; border:2px solid #24301f; border-radius:10px; color:#eef2ea; font-family:inherit; font-size:22px; font-weight:700; padding:16px; width:100%; }
        .gs-answer input:focus-visible { outline:3px solid #f0623b; outline-offset:2px; border-color:#f0623b; }
        .gs-answer button { padding:17px; border-radius:10px; border:none; background:#f0623b; color:#160a06; font-size:15px; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; cursor:pointer; font-family:inherit; }
        .gs-answer button:disabled { opacity:0.4; cursor:not-allowed; }
        .gs-state { text-align:center; font-size:16px; font-weight:800; padding:18px; border-radius:10px; margin:0; }
        .gs-state.in { background:rgba(240,98,59,.12); border:1px solid #f0623b; color:#f0623b; }
        .gs-state.locked { background:rgba(249,83,53,.12); border:1px solid #f95335; color:#f95335; }
        .gs-note { text-align:center; font-size:13px; color:#9db09d; margin:0; }
      `}</style>
      {body}
    </main>
  );
}
