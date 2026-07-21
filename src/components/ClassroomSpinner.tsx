"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  joinClassroomSpinnerRoom,
  type ClassroomSpinnerSnapshot,
  type ClassroomSpinnerSyncChannel,
} from "@/lib/classroomSpinnerSync";
import { TeacherApiError, teacherApiRequest } from "@/lib/teacherApi";
import type { TeacherRemoteCommand } from "@/lib/liveClassFlow";
import { publicSuccessCriterion } from "@/lib/successCriterion";

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
  syncKey: string | null | undefined;
  periodId: string | null | undefined;
  stateId?: string;
  syncScope?: string;
  role?: "controller" | "mirror";
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
  syncKey,
  periodId,
  stateId,
  syncScope = "current",
  role = "controller",
  learningIntention = "",
  successCriterion = "",
  remoteCommand = null,
}: ClassroomSpinnerProps) {
  const reelCount = mode === "readers" ? 2 : 1;
  const resolvedStateId = stateId || (mode === "readers" ? "learning-target-readers" : "ipad-kid");
  const [students, setStudents] = useState<SpinnerStudent[]>([]);
  const [displayNames, setDisplayNames] = useState<string[]>(Array(reelCount).fill("Ready"));
  const [landed, setLanded] = useState<boolean[]>(Array(reelCount).fill(false));
  const [spinning, setSpinning] = useState(false);
  const [status, setStatus] = useState(role === "controller" ? "Loading the active class roster." : "Waiting for the main display.");
  const [spinNonce, setSpinNonce] = useState<string | null>(null);
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
  const syncRef = useRef<ClassroomSpinnerSyncChannel | null>(null);
  const snapshotRef = useRef<ClassroomSpinnerSnapshot | null>(null);
  const mirrorHydratedRef = useRef(false);
  const lastMirrorSnapshotAtRef = useRef(0);
  const publishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPublishAtRef = useRef(0);

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
        label: "Success Criterion",
        target: publicSuccessCriterion(successCriterion),
      },
    ]
    : [{ label: "iPad Kid", target: "This week's classroom role" }];

  useEffect(() => {
    if (cycleRef.current) {
      clearInterval(cycleRef.current);
      cycleRef.current = null;
    }
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (publishTimeoutRef.current) {
      clearTimeout(publishTimeoutRef.current);
      publishTimeoutRef.current = null;
    }
    spinningRef.current = false;
    settledNamesRef.current = Array(reelCount).fill(null);
    snapshotRef.current = null;
    lastPublishAtRef.current = 0;
    lastMirrorSnapshotAtRef.current = 0;
    setDisplayNames(Array(reelCount).fill("Ready"));
    setLanded(Array(reelCount).fill(false));
    setSpinning(false);
    setSpinNonce(null);
    mirrorHydratedRef.current = false;
    setStatus(role === "controller" ? "Loading the active class roster." : "Waiting for the main display.");
  }, [periodId, reelCount, resolvedStateId, role, sessionId, syncScope]);

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
    if (role === "mirror") {
      setStudents([]);
      return;
    }
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
  }, [periodId, reelCount, role, sessionId]);

  useEffect(() => () => {
    if (cycleRef.current) clearInterval(cycleRef.current);
    timeoutsRef.current.forEach(clearTimeout);
    if (publishTimeoutRef.current) clearTimeout(publishTimeoutRef.current);
  }, []);

  useEffect(() => {
    const snapshot: ClassroomSpinnerSnapshot = {
      stateId: resolvedStateId,
      mode,
      displayNames,
      landed,
      spinning,
      status,
      spinNonce,
    };
    snapshotRef.current = snapshot;
    if (role === "controller") {
      const elapsed = Date.now() - lastPublishAtRef.current;
      if (elapsed >= 120) {
        lastPublishAtRef.current = Date.now();
        syncRef.current?.publish(snapshot);
      } else {
        if (publishTimeoutRef.current) clearTimeout(publishTimeoutRef.current);
        publishTimeoutRef.current = setTimeout(() => {
          publishTimeoutRef.current = null;
          const latest = snapshotRef.current;
          if (!latest) return;
          lastPublishAtRef.current = Date.now();
          syncRef.current?.publish(latest);
        }, Math.max(1, 120 - elapsed));
      }
    }
  }, [displayNames, landed, mode, resolvedStateId, role, spinNonce, spinning, status]);

  useEffect(() => {
    syncRef.current?.close();
    syncRef.current = null;
    mirrorHydratedRef.current = false;
    if (!sessionId || !syncKey) {
      setStatus(role === "controller"
        ? "Start or select a class session before using the spinner."
        : "Waiting for the active class session.");
      return;
    }

    const room = `${sessionId}:${syncScope}`;
    const channel = role === "controller"
      ? joinClassroomSpinnerRoom(room, syncKey, {
          role: "controller",
          getSnapshot: () => snapshotRef.current,
        })
      : joinClassroomSpinnerRoom(room, syncKey, {
          role: "mirror",
          onSnapshot: ({ snapshot }) => {
            if (
              snapshot.stateId !== resolvedStateId
              || snapshot.mode !== mode
              || snapshot.displayNames.length !== reelCount
            ) return;
            mirrorHydratedRef.current = true;
            lastMirrorSnapshotAtRef.current = Date.now();
            setDisplayNames(snapshot.displayNames);
            setLanded(snapshot.landed);
            setSpinning(snapshot.spinning);
            setSpinNonce(snapshot.spinNonce);
            setStatus(snapshot.spinning ? "Choosing from the active class." : "Synced with the main display.");
          },
        });
    syncRef.current = channel;
    if (role === "controller" && snapshotRef.current) channel.publish(snapshotRef.current);

    const retryInterval = role === "mirror"
      ? window.setInterval(() => {
          if (!mirrorHydratedRef.current) channel.requestSnapshot();
        }, 1_000)
      : null;
    if (role === "mirror") channel.requestSnapshot();
    return () => {
      if (retryInterval !== null) window.clearInterval(retryInterval);
      if (syncRef.current === channel) syncRef.current = null;
      channel.close();
    };
  }, [mode, reelCount, resolvedStateId, role, sessionId, syncKey, syncScope]);

  useEffect(() => {
    if (!sessionId) return;
    if (role === "controller") {
      const heartbeat = window.setInterval(() => {
        const snapshot = snapshotRef.current;
        if (snapshot) syncRef.current?.publish(snapshot);
      }, 10_000);
      return () => window.clearInterval(heartbeat);
    }

    const staleCheck = window.setInterval(() => {
      if (!mirrorHydratedRef.current || Date.now() - lastMirrorSnapshotAtRef.current <= 25_000) return;
      mirrorHydratedRef.current = false;
      setStatus("Reconnecting to the main display.");
      syncRef.current?.requestSnapshot();
    }, 5_000);
    return () => window.clearInterval(staleCheck);
  }, [role, sessionId, syncScope]);

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
    if (role !== "controller" || !pending || !sessionId || remoteReceiptInFlightRef.current) return;

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
  }, [role, sessionId]);

  useEffect(() => {
    const interval = window.setInterval(() => { void flushRemoteReceipt(); }, 1_000);
    return () => window.clearInterval(interval);
  }, [flushRemoteReceipt]);

  const spin = useCallback((command: TeacherRemoteCommand | null = null) => {
    if (role !== "controller" || spinningRef.current || students.length < reelCount) return false;

    const { picks, nextUsedIds } = selectFairPicks(students, usedIdsRef.current, reelCount);
    if (picks.length !== reelCount) return false;

    spinningRef.current = true;
    setSpinNonce(typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `spin-${Date.now()}`);
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
  }, [flushRemoteReceipt, reelCount, role, storageKey, students, tone]);

  useEffect(() => {
    if (role !== "controller") return;
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
  }, [mode, reelCount, remoteCommand, role, spin, spinning, students.length]);

  const canSpin = role === "controller" && students.length >= reelCount && !spinning;

  return (
    <section className={`classroom-spinner ${mode} ${role}`} aria-label={mode === "readers" ? "Reader spinner" : "iPad Kid spinner"}>
      <style>{`
        /* Warm Notebook (Design canvas turn 12): white cards on the host's
           dotted paper, ink text, one semantic accent. The accent var
           cascades from whichever warm surface hosts the spinner. */
        .classroom-spinner { --sp-acc:var(--acc, var(--lf-accent, #50A3A4)); --sp-acc-deep:color-mix(in srgb, var(--sp-acc) 62%, #201E1A);
          position:absolute; inset:0; display:grid; grid-template-rows:minmax(0,1fr) auto; gap:18px; overflow:auto; padding:clamp(22px,4vw,58px); }
        .classroom-spinner-grid { width:min(100%,1280px); margin:auto; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:clamp(16px,2.4vw,30px); align-items:stretch; }
        .classroom-spinner.ipad .classroom-spinner-grid { width:min(100%,720px); grid-template-columns:1fr; }
        .classroom-spinner-card { min-width:0; display:grid; grid-template-rows:auto minmax(96px,auto) auto; gap:13px; border:1px solid #E3D9C2; border-top:6px solid var(--sp-acc); border-radius:22px; background:#fff; padding:clamp(18px,2.8vw,34px); box-shadow:0 12px 32px rgba(40,32,20,0.10); }
        .classroom-spinner-label { margin:0; color:var(--sp-acc-deep); font-size:clamp(0.72rem,1.25vw,0.95rem); font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .classroom-spinner-target { margin:0; align-self:center; color:#201E1A; font-size:clamp(1.15rem,2.1vw,1.8rem); line-height:1.25; font-weight:750; text-wrap:balance; }
        .classroom-spinner-window { min-height:clamp(92px,14vh,150px); display:grid; place-items:center; overflow:hidden; border:2px solid #E3D9C2; border-radius:16px; background:#F6F3EC; padding:16px; color:#2E4A54; }
        .classroom-spinner-window.spinning { animation:classroom-spinner-shake 160ms linear infinite; }
        .classroom-spinner-window.landed { border-color:var(--sp-acc); box-shadow:0 0 0 3px color-mix(in srgb,var(--sp-acc) 24%,transparent) inset; }
        .classroom-spinner-name { max-width:100%; overflow:hidden; text-overflow:ellipsis; color:#2E4A54; text-align:center; white-space:nowrap; font-size:clamp(1.7rem,4.2vw,4rem); line-height:1; font-weight:800; letter-spacing:-0.03em; }
        .classroom-spinner-window.spinning .classroom-spinner-name { filter:blur(1.2px); opacity:0.72; }
        .classroom-spinner-actions { display:grid; justify-items:center; gap:9px; }
        .classroom-spinner-button { min-width:min(100%,340px); min-height:58px; border:0; border-radius:14px; background:var(--sp-acc); color:#fff; padding:0 24px; font:inherit; font-size:clamp(1rem,1.7vw,1.25rem); font-weight:800; cursor:pointer; box-shadow:0 4px 16px rgba(40,32,20,0.14); }
        .classroom-spinner-button:disabled { cursor:not-allowed; opacity:0.48; }
        .classroom-spinner-status { margin:0; color:#5C6E75; text-align:center; font-size:0.78rem; font-weight:700; }
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
        {role === "controller" ? (
          <button className="classroom-spinner-button" type="button" disabled={!canSpin} onClick={() => { spin(); }}>
            {spinning ? "Spinning" : mode === "readers" ? "Spin for readers" : "Spin for iPad Kid"}
          </button>
        ) : null}
        <p className="classroom-spinner-status" role="status">{status}</p>
      </div>
    </section>
  );
}
