"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TeacherApiError, teacherApiRequest } from "@/lib/teacherApi";
import type { TeacherRemoteCommand } from "@/lib/liveClassFlow";

export type ClassroomSpinnerMode = "readers" | "ipad";

interface SpinnerStudent {
  id: string;
  fullName: string;
}

interface SpinnerRosterResponse {
  students: SpinnerStudent[];
  source: "session" | "period";
}

interface ClassroomSpinnerProps {
  mode: ClassroomSpinnerMode;
  sessionId: string | null | undefined;
  periodId: string | null | undefined;
  learningIntention?: string;
  successCriterion?: string;
  remoteCommand?: TeacherRemoteCommand | null;
}

const FAIR_ROTATION_KEY = "bdm-classroom-spinner-fair-v1";

function randomItem<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffled<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function selectFairPicks(
  students: SpinnerStudent[],
  usedIds: Set<string>,
  count: number,
): { picks: SpinnerStudent[]; nextUsedIds: Set<string> } {
  const currentIds = new Set(students.map((student) => student.id));
  const validUsedIds = new Set([...usedIds].filter((id) => currentIds.has(id)));
  const unused = shuffled(students.filter((student) => !validUsedIds.has(student.id)));

  if (unused.length >= count) {
    const picks = unused.slice(0, count);
    picks.forEach((student) => validUsedIds.add(student.id));
    return { picks, nextUsedIds: validUsedIds };
  }

  if (unused.length === 0) {
    const picks = shuffled(students).slice(0, count);
    return { picks, nextUsedIds: new Set(picks.map((student) => student.id)) };
  }

  // Finish the current rotation before starting the next one. Students selected
  // after the boundary are the only names recorded in the new rotation.
  const unusedIds = new Set(unused.map((student) => student.id));
  const resetPicks = shuffled(students.filter((student) => !unusedIds.has(student.id)))
    .slice(0, count - unused.length);
  return {
    picks: [...unused, ...resetPicks],
    nextUsedIds: new Set(resetPicks.map((student) => student.id)),
  };
}

export default function ClassroomSpinner({
  mode,
  sessionId,
  periodId,
  learningIntention = "",
  successCriterion = "",
  remoteCommand = null,
}: ClassroomSpinnerProps) {
  const reelCount = mode === "readers" ? 2 : 1;
  const [students, setStudents] = useState<SpinnerStudent[]>([]);
  const [displayNames, setDisplayNames] = useState<string[]>(Array(reelCount).fill("Ready"));
  const [landed, setLanded] = useState<boolean[]>(Array(reelCount).fill(false));
  const [spinning, setSpinning] = useState(false);
  const [status, setStatus] = useState("Loading the active class roster.");
  const spinningRef = useRef(false);
  const usedIdsRef = useRef<Set<string>>(new Set());
  const settledNamesRef = useRef<Array<string | null>>(Array(reelCount).fill(null));
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const audioRef = useRef<AudioContext | null>(null);
  const queuedRemoteCommandRef = useRef<TeacherRemoteCommand | null>(null);
  const handledRemoteNoncesRef = useRef<Set<string>>(new Set());
  const pendingRemoteReceiptRef = useRef<TeacherRemoteCommand | null>(null);
  const remoteReceiptInFlightRef = useRef(false);

  const storageKey = useMemo(
    () => `${FAIR_ROTATION_KEY}:${periodId || "no-period"}:${mode}`,
    [mode, periodId],
  );

  const reels = mode === "readers"
    ? [
      {
        label: "Learning Intention",
        target: learningIntention || "Add the Learning Intention in Notion.",
      },
      {
        label: "Success Criteria",
        target: successCriterion || "Choose one I can statement in Notion.",
      },
    ]
    : [{ label: "iPad Kid", target: "This week's classroom role" }];

  useEffect(() => {
    setDisplayNames(Array(reelCount).fill("Ready"));
    setLanded(Array(reelCount).fill(false));
  }, [reelCount]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "[]") as unknown;
      usedIdsRef.current = new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []);
    } catch {
      usedIdsRef.current = new Set();
    }
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;
    if (!periodId) {
      setStudents([]);
      setStatus("Start or select a class session before using the spinner.");
      return;
    }

    setStatus("Loading the active class roster.");
    const params = new URLSearchParams({ periodId, minimum: String(reelCount) });
    if (sessionId) params.set("sessionId", sessionId);
    void teacherApiRequest<SpinnerRosterResponse>(`/api/teacher/spinner-roster?${params.toString()}`)
      .then((rosterResult) => {
        if (cancelled) return;
        const roster = (rosterResult.students || [])
          .filter((student) => student.id && student.fullName)
          .sort((left, right) => left.fullName.localeCompare(right.fullName));
        setStudents(roster);
        setStatus(roster.length
          ? rosterResult.source === "session"
            ? `${roster.length} joined students in the fair rotation.`
            : `${roster.length} rostered students in the fair rotation.`
          : "No students are assigned to this class roster yet.");
      })
      .catch((error) => {
        if (cancelled) return;
        setStudents([]);
        setStatus(error instanceof Error ? error.message : "The class roster could not be loaded.");
      });

    return () => { cancelled = true; };
  }, [periodId, reelCount, sessionId]);

  useEffect(() => () => {
    if (cycleRef.current) clearInterval(cycleRef.current);
    timeoutsRef.current.forEach(clearTimeout);
  }, []);

  const tone = useCallback((frequency: number, duration = 0.09) => {
    try {
      audioRef.current = audioRef.current
        ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const context = audioRef.current;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.start();
      oscillator.stop(context.currentTime + duration + 0.02);
    } catch {
      // The visual picker still works when browser audio is unavailable.
    }
  }, []);

  const flushRemoteReceipt = useCallback(async () => {
    const pending = pendingRemoteReceiptRef.current;
    if (!pending || !sessionId || remoteReceiptInFlightRef.current) return;

    remoteReceiptInFlightRef.current = true;
    try {
      await teacherApiRequest("/api/teacher/session", {
        method: "POST",
        body: JSON.stringify({
          action: "update",
          sessionId,
          remoteCommand: pending,
          expectedRemoteCommandNonce: pending.nonce,
        }),
      });
      if (pendingRemoteReceiptRef.current?.nonce === pending.nonce) {
        pendingRemoteReceiptRef.current = null;
      }
    } catch (error) {
      if (error instanceof TeacherApiError && error.status === 409) {
        if (pendingRemoteReceiptRef.current?.nonce === pending.nonce) {
          pendingRemoteReceiptRef.current = null;
        }
      }
    } finally {
      remoteReceiptInFlightRef.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    const interval = window.setInterval(() => { void flushRemoteReceipt(); }, 1_000);
    return () => window.clearInterval(interval);
  }, [flushRemoteReceipt]);

  const spin = useCallback((command: TeacherRemoteCommand | null = null) => {
    if (spinningRef.current || students.length < reelCount) return false;

    const { picks, nextUsedIds } = selectFairPicks(students, usedIdsRef.current, reelCount);
    if (picks.length !== reelCount) return false;

    spinningRef.current = true;
    setSpinning(true);
    setLanded(Array(reelCount).fill(false));
    settledNamesRef.current = Array(reelCount).fill(null);
    if (cycleRef.current) clearInterval(cycleRef.current);
    cycleRef.current = setInterval(() => {
      setDisplayNames(Array.from(
        { length: reelCount },
        (_, index) => settledNamesRef.current[index] ?? randomItem(students)?.fullName ?? "Ready",
      ));
    }, 72);

    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = picks.map((student, index) => setTimeout(() => {
      settledNamesRef.current[index] = student.fullName;
      setDisplayNames((current) => current.map((name, reelIndex) => reelIndex === index ? student.fullName : name));
      setLanded((current) => current.map((value, reelIndex) => reelIndex === index ? true : value));
      tone(540 + (index * 160));
    }, 1_150 + (index * 650)));

    timeoutsRef.current.push(setTimeout(() => {
      if (cycleRef.current) {
        clearInterval(cycleRef.current);
        cycleRef.current = null;
      }
      const winnerNames = picks.map((student) => student.fullName);
      settledNamesRef.current = winnerNames;
      setDisplayNames(winnerNames);
      setLanded(Array(reelCount).fill(true));
      usedIdsRef.current = nextUsedIds;
      try { localStorage.setItem(storageKey, JSON.stringify([...nextUsedIds])); } catch { /* storage is optional */ }
      spinningRef.current = false;
      setSpinning(false);
      setStatus(`${students.length - nextUsedIds.size} students remain before the fair rotation resets.`);
      tone(880, 0.18);
      if (command) {
        pendingRemoteReceiptRef.current = {
          ...command,
          receivedAt: new Date().toISOString(),
        };
        void flushRemoteReceipt();
      }
    }, 1_150 + ((reelCount - 1) * 650) + 350));
    return true;
  }, [flushRemoteReceipt, reelCount, storageKey, students, tone]);

  useEffect(() => {
    const expectedStateId = mode === "readers" ? "learning-target-readers" : "ipad-kid";
    const commandMatches = remoteCommand?.action === "spin-spinner"
      && remoteCommand.stateId === expectedStateId;

    if (!commandMatches || remoteCommand.receivedAt) {
      if (queuedRemoteCommandRef.current?.nonce === remoteCommand?.nonce || !commandMatches) {
        queuedRemoteCommandRef.current = null;
      }
      if (remoteCommand?.receivedAt) handledRemoteNoncesRef.current.add(remoteCommand.nonce);
      return;
    }
    if (handledRemoteNoncesRef.current.has(remoteCommand.nonce)) return;

    const queued = queuedRemoteCommandRef.current?.nonce === remoteCommand.nonce
      ? queuedRemoteCommandRef.current
      : remoteCommand;
    queuedRemoteCommandRef.current = queued;

    if (spinningRef.current || spinning) {
      setStatus("Remote re-spin queued. The current spin will finish first.");
      return;
    }
    if (students.length < reelCount) {
      setStatus("Remote spin queued. Waiting for the active class roster.");
      return;
    }

    queuedRemoteCommandRef.current = null;
    handledRemoteNoncesRef.current.add(queued.nonce);
    if (!spin(queued)) {
      handledRemoteNoncesRef.current.delete(queued.nonce);
      queuedRemoteCommandRef.current = queued;
    }
  }, [mode, reelCount, remoteCommand, spin, spinning, students.length]);

  const canSpin = students.length >= reelCount && !spinning;

  return (
    <section className={`classroom-spinner ${mode}`} aria-label={mode === "readers" ? "Reader spinner" : "iPad Kid spinner"}>
      <style>{`
        .classroom-spinner { position:absolute; inset:0; display:grid; grid-template-rows:minmax(0,1fr) auto; gap:18px; overflow:auto; background:radial-gradient(circle at 50% 42%,var(--stage-glow),transparent 58%); padding:clamp(22px,4vw,58px); }
        .classroom-spinner-grid { width:min(100%,1280px); margin:auto; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:clamp(16px,2.4vw,30px); align-items:stretch; }
        .classroom-spinner.ipad .classroom-spinner-grid { width:min(100%,720px); grid-template-columns:1fr; }
        .classroom-spinner-card { min-width:0; display:grid; grid-template-rows:auto minmax(96px,auto) auto; gap:13px; border:1px solid var(--stage-line); border-top:6px solid var(--stage-accent); border-radius:22px; background:color-mix(in srgb,var(--stage-panel) 94%,transparent); padding:clamp(18px,2.8vw,34px); box-shadow:0 22px 52px rgba(0,0,0,0.24); }
        .classroom-spinner-label { margin:0; color:var(--stage-accent); font-size:clamp(0.72rem,1.25vw,0.95rem); font-weight:950; letter-spacing:0.13em; text-transform:uppercase; }
        .classroom-spinner-target { margin:0; align-self:center; color:#fff; font-size:clamp(1.15rem,2.1vw,1.8rem); line-height:1.25; font-weight:820; text-wrap:balance; }
        .classroom-spinner-window { min-height:clamp(92px,14vh,150px); display:grid; place-items:center; overflow:hidden; border:2px solid var(--stage-line); border-radius:16px; background:color-mix(in srgb,var(--stage-base) 82%,#000); padding:16px; color:#fff; }
        .classroom-spinner-window.spinning { animation:classroom-spinner-shake 160ms linear infinite; }
        .classroom-spinner-window.landed { border-color:var(--stage-accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--stage-accent) 40%,transparent) inset,0 0 34px color-mix(in srgb,var(--stage-accent) 28%,transparent); }
        .classroom-spinner-name { max-width:100%; overflow:hidden; text-overflow:ellipsis; color:#fff; text-align:center; white-space:nowrap; font-size:clamp(1.7rem,4.2vw,4rem); line-height:1; font-weight:950; letter-spacing:-0.035em; }
        .classroom-spinner-window.spinning .classroom-spinner-name { filter:blur(1.2px); opacity:0.72; }
        .classroom-spinner-actions { display:grid; justify-items:center; gap:9px; }
        .classroom-spinner-button { min-width:min(100%,340px); min-height:58px; border:2px solid var(--stage-accent); border-radius:14px; background:var(--stage-accent); color:var(--stage-base); padding:0 24px; font:inherit; font-size:clamp(1rem,1.7vw,1.25rem); font-weight:950; cursor:pointer; box-shadow:0 12px 28px rgba(0,0,0,0.2); }
        .classroom-spinner-button:disabled { cursor:not-allowed; opacity:0.48; }
        .classroom-spinner-status { margin:0; color:var(--stage-muted); text-align:center; font-size:0.78rem; font-weight:760; }
        @keyframes classroom-spinner-shake { 50% { transform:translateY(-2px); } }
        @media (max-width:760px) { .classroom-spinner-grid { grid-template-columns:1fr; } .classroom-spinner { padding:18px; } }
      `}</style>

      <div className="classroom-spinner-grid">
        {reels.map((reel, index) => (
          <article className="classroom-spinner-card" key={reel.label}>
            <p className="classroom-spinner-label">{reel.label}</p>
            <p className="classroom-spinner-target">{reel.target}</p>
            <div className={`classroom-spinner-window${spinning && !landed[index] ? " spinning" : ""}${landed[index] && !spinning ? " landed" : ""}`}>
              <span className="classroom-spinner-name">{displayNames[index] || "Ready"}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="classroom-spinner-actions">
        <button className="classroom-spinner-button" type="button" disabled={!canSpin} onClick={() => { spin(); }}>
          {spinning ? "Spinning" : mode === "readers" ? "Spin for readers" : "Spin for iPad Kid"}
        </button>
        <p className="classroom-spinner-status" role="status">{status}</p>
      </div>
    </section>
  );
}
