"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

interface ClassroomNamePickerProps {
  names: string[];
  labels: string[];
  buttonLabel: string;
  compact?: boolean;
}

function randomItem<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

export default function ClassroomNamePicker({
  names,
  labels,
  buttonLabel,
  compact = false,
}: ClassroomNamePickerProps) {
  const roster = useMemo(
    () => [...new Set(names.map((name) => name.trim()).filter(Boolean))],
    [names],
  );
  const labelKey = JSON.stringify(labels);
  const stableLabels = useMemo(() => JSON.parse(labelKey) as string[], [labelKey]);
  const [display, setDisplay] = useState<string[]>(() => stableLabels.map(() => "Ready to pick"));
  const [spinning, setSpinning] = useState(false);
  const usedRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDisplay(stableLabels.map(() => "Ready to pick"));
    usedRef.current.clear();
  }, [stableLabels]);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const pick = useCallback(() => {
    if (spinning || roster.length < stableLabels.length) return;

    let available = roster.filter((name) => !usedRef.current.has(name));
    if (available.length < stableLabels.length) {
      usedRef.current.clear();
      available = [...roster];
    }

    const selected: string[] = [];
    for (let index = 0; index < stableLabels.length; index += 1) {
      const pool = available.filter((name) => !selected.includes(name));
      const name = randomItem(pool);
      if (name) selected.push(name);
    }

    if (selected.length !== stableLabels.length) return;
    setSpinning(true);
    intervalRef.current = setInterval(() => {
      setDisplay(stableLabels.map(() => randomItem(roster) || "Ready to pick"));
    }, 70);

    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      selected.forEach((name) => usedRef.current.add(name));
      setDisplay(selected);
      setSpinning(false);
    }, 950);
  }, [roster, spinning, stableLabels]);

  const canPick = roster.length >= stableLabels.length;

  return (
    <section className={`class-picker${compact ? " is-compact" : ""}`} aria-label="Random student picker">
      <style>{`
        .class-picker { display:grid; gap:14px; }
        .class-picker-grid { display:grid; grid-template-columns:repeat(var(--picker-count),minmax(0,1fr)); gap:12px; }
        .class-picker-card { min-width:0; border:1px solid #d8cebb; border-radius:14px; background:#fff; padding:14px 16px; box-shadow:0 8px 20px rgba(32,30,26,0.07); }
        .class-picker-label { margin:0 0 5px; color:#8d8374; font-size:0.68rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .class-picker-name { margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#201e1a; font-size:clamp(1.15rem,2.2vw,2rem); line-height:1.1; font-weight:900; }
        .class-picker-name.is-spinning { color:#50a3a4; }
        .class-picker-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .class-picker-button { min-height:46px; border:0; border-radius:12px; background:#201e1a; color:#fff; padding:0 18px; font:inherit; font-size:0.9rem; font-weight:900; cursor:pointer; touch-action:manipulation; }
        .class-picker-button:disabled { opacity:0.42; cursor:not-allowed; }
        .class-picker-note { margin:0; color:#766d5f; font-size:0.76rem; line-height:1.35; font-weight:750; }
        .class-picker.is-compact { position:absolute; right:18px; bottom:18px; z-index:8; width:min(360px,calc(100% - 36px)); border:1px solid #d8cebb; border-radius:16px; background:rgba(255,255,255,0.97); padding:10px; box-shadow:0 16px 36px rgba(32,30,26,0.18); }
        .class-picker.is-compact .class-picker-grid { gap:8px; }
        .class-picker.is-compact .class-picker-card { border:0; border-radius:10px; background:#faf6ee; padding:9px 11px; box-shadow:none; }
        .class-picker.is-compact .class-picker-name { font-size:1.1rem; }
        .class-picker.is-compact .class-picker-button { min-height:40px; }
        @media (max-width:700px) {
          .class-picker-grid { grid-template-columns:1fr; }
        }
      `}</style>
      <div className="class-picker-grid" style={{ "--picker-count": stableLabels.length } as CSSProperties}>
        {stableLabels.map((label, index) => (
          <article className="class-picker-card" key={label}>
            <p className="class-picker-label">{label}</p>
            <p className={`class-picker-name${spinning ? " is-spinning" : ""}`} aria-live="polite">
              {display[index] || "Ready to pick"}
            </p>
          </article>
        ))}
      </div>
      <div className="class-picker-actions">
        <button className="class-picker-button" type="button" onClick={pick} disabled={!canPick || spinning}>
          {spinning ? "Picking" : buttonLabel}
        </button>
        {!canPick ? <p className="class-picker-note">Open a live class with at least {stableLabels.length} rostered student{stableLabels.length === 1 ? "" : "s"}.</p> : null}
      </div>
    </section>
  );
}
