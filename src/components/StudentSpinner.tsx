"use client";

// Student Spinner — slot-machine style random picker.
// • 2 reels: Learning Intention reader + Success Criteria reader
// • 3 reels: adds an "iPad" reel that pulls from students you mark as iPad kids
// • Paste a class list per class (saved on this computer). "Fair mode" makes sure
//   everyone gets picked before anyone repeats.
// Used standalone (/spinner) and as an overlay at the end of the Warm-Up step.

import { useEffect, useRef, useState, useCallback } from "react";

interface ClassRoster {
  names: string[];
  ipad: string[];
}
type Classes = Record<string, ClassRoster>;

const LS_CLASSES = "bdm-spinner-classes-v1";
const LS_CURRENT = "bdm-spinner-current-v1";
const LS_LABELS = "bdm-spinner-labels-v1";
const LS_FAIR = "bdm-spinner-fair-v1";

const DEFAULT_LABELS = ["Learning Intention", "Success Criteria", "iPad"];
const REEL_COLORS = ["var(--bdb-teal)", "var(--bdb-green)", "var(--bdb-amber)"];

function parseList(text: string): string[] {
  return text.split("\n").map((s) => s.trim()).filter(Boolean);
}
function sample<T>(arr: T[]): T | undefined {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function StudentSpinner({ onClose }: { onClose?: () => void }) {
  const [classes, setClasses] = useState<Classes>({});
  const [current, setCurrent] = useState<string>("");
  const [labels, setLabels] = useState<string[]>(DEFAULT_LABELS);
  const [fair, setFair] = useState(true);
  const [wheels, setWheels] = useState<2 | 3>(2);

  const [editing, setEditing] = useState(false);
  const [display, setDisplay] = useState<string[]>(["—", "—", "—"]);
  const [landed, setLanded] = useState<boolean[]>([true, true, true]);
  const [spinning, setSpinning] = useState(false);

  const usedRef = useRef<Set<string>>(new Set());
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef = useRef<AudioContext | null>(null);

  // ── Load saved data ─────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const c = localStorage.getItem(LS_CLASSES);
      const parsed: Classes = c ? JSON.parse(c) : {};
      setClasses(parsed);
      const cur = localStorage.getItem(LS_CURRENT) || Object.keys(parsed)[0] || "";
      setCurrent(cur);
      const l = localStorage.getItem(LS_LABELS);
      if (l) setLabels(JSON.parse(l));
      const f = localStorage.getItem(LS_FAIR);
      if (f != null) setFair(f === "1");
    } catch { /* ignore */ }
    return () => {
      if (cycleRef.current) clearInterval(cycleRef.current);
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const saveClasses = useCallback((next: Classes) => {
    setClasses(next);
    try { localStorage.setItem(LS_CLASSES, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);
  const saveCurrent = useCallback((name: string) => {
    setCurrent(name);
    usedRef.current = new Set();
    try { localStorage.setItem(LS_CURRENT, name); } catch { /* ignore */ }
  }, []);
  const saveLabels = useCallback((next: string[]) => {
    setLabels(next);
    try { localStorage.setItem(LS_LABELS, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);
  const saveFair = useCallback((v: boolean) => {
    setFair(v);
    try { localStorage.setItem(LS_FAIR, v ? "1" : "0"); } catch { /* ignore */ }
  }, []);

  const tone = useCallback((freq: number, dur = 0.08) => {
    try {
      audioRef.current = audioRef.current
        ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
    } catch { /* ignore */ }
  }, []);

  const roster = current ? classes[current] : undefined;
  const allNames = roster?.names ?? [];
  const ipadNames = (roster?.ipad ?? []).filter((n) => allNames.includes(n));
  const mainNames = allNames.filter((n) => !ipadNames.includes(n));

  function poolFor(reel: number): string[] {
    if (wheels === 3 && reel === 2) return ipadNames;
    return wheels === 3 ? mainNames : allNames;
  }

  function pickFor(pool: string[], taken: Set<string>): string | undefined {
    let avail = pool.filter((n) => !taken.has(n));
    if (fair) {
      const fairAvail = avail.filter((n) => !usedRef.current.has(n));
      if (fairAvail.length > 0) avail = fairAvail;
      else { pool.forEach((n) => usedRef.current.delete(n)); avail = pool.filter((n) => !taken.has(n)); }
    }
    return sample(avail.length ? avail : pool.filter((n) => !taken.has(n)));
  }

  function spin() {
    if (spinning) return;
    // enough students?
    if (allNames.length < wheels) { setEditing(true); return; }
    if (wheels === 3 && ipadNames.length === 0) { setEditing(true); return; }

    const taken = new Set<string>();
    const picks: string[] = [];
    for (let i = 0; i < wheels; i++) {
      const p = pickFor(poolFor(i), taken);
      if (p) { picks.push(p); taken.add(p); } else picks.push("—");
    }

    setSpinning(true);
    setLanded(Array(wheels).fill(false));
    setDisplay((d) => d.map((v, i) => (i < wheels ? v : v)));

    if (cycleRef.current) clearInterval(cycleRef.current);
    cycleRef.current = setInterval(() => {
      setDisplay((prev) => prev.map((v, i) => (i < wheels ? (sample(poolFor(i)) ?? v) : v)));
    }, 70);

    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    for (let i = 0; i < wheels; i++) {
      const t = setTimeout(() => {
        setDisplay((prev) => prev.map((v, idx) => (idx === i ? picks[i] : v)));
        setLanded((prev) => prev.map((v, idx) => (idx === i ? true : v)));
        tone(520 + i * 140);
      }, 1300 + i * 750);
      timeoutsRef.current.push(t);
    }
    const end = setTimeout(() => {
      if (cycleRef.current) clearInterval(cycleRef.current);
      setSpinning(false);
      tone(880, 0.18);
      if (fair) picks.forEach((p) => p !== "—" && usedRef.current.add(p));
    }, 1300 + (wheels - 1) * 750 + 300);
    timeoutsRef.current.push(end);
  }

  // ── Roster editing ──────────────────────────────────────────────────────
  function updateNames(text: string) {
    if (!current) return;
    const names = parseList(text);
    saveClasses({ ...classes, [current]: { names, ipad: (roster?.ipad ?? []).filter((n) => names.includes(n)) } });
  }
  function toggleIpad(name: string) {
    if (!current || !roster) return;
    const has = roster.ipad.includes(name);
    const ipad = has ? roster.ipad.filter((n) => n !== name) : [...roster.ipad, name];
    saveClasses({ ...classes, [current]: { ...roster, ipad } });
  }
  function addClass() {
    const name = prompt("New class name (e.g., Period 3):")?.trim();
    if (!name) return;
    if (!classes[name]) saveClasses({ ...classes, [name]: { names: [], ipad: [] } });
    saveCurrent(name);
    setEditing(true);
  }
  function deleteClass() {
    if (!current) return;
    if (!confirm(`Delete class "${current}"?`)) return;
    const next = { ...classes };
    delete next[current];
    saveClasses(next);
    saveCurrent(Object.keys(next)[0] || "");
  }

  const classNames = Object.keys(classes);

  return (
    <div className="sp-root">
      <style>{`
        .sp-root { min-height:100vh; width:100%; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); display:grid; grid-template-rows:auto 1fr auto; }
        .sp-top { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:14px 24px; border-bottom:1px solid var(--bdb-line); flex-wrap:wrap; }
        .sp-mark { font-size:0.76rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:var(--bdb-teal); margin:0; }
        .sp-tbtns { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .sp-sel { background:var(--bdb-card); border:1px solid var(--bdb-line); color:var(--bdb-ink); border-radius:8px; padding:8px 12px; font-weight:700; font-size:0.9rem; }
        .sp-btn { font-size:0.78rem; font-weight:700; letter-spacing:0.04em; color:var(--bdb-ink-soft); background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:999px; padding:8px 12px; cursor:pointer; text-decoration:none; }
        .sp-btn:hover { border-color:var(--bdb-teal); color:var(--bdb-ink); }
        .sp-toggle { display:inline-flex; border:1px solid var(--bdb-line); border-radius:8px; overflow:hidden; }
        .sp-toggle button { background:var(--bdb-card); border:none; color:var(--bdb-ink-soft); font-weight:700; font-size:0.82rem; padding:8px 12px; cursor:pointer; }
        .sp-toggle button.on { background:var(--bdb-teal); color:#fff; }

        .sp-stage { display:grid; align-content:center; justify-items:center; gap:26px; padding:24px; }
        .sp-reels { display:flex; gap:18px; flex-wrap:wrap; justify-content:center; }
        .sp-reel { width:min(34vw,320px); }
        .sp-reel-label { text-align:center; font-size:0.8rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; margin:0 0 8px; }
        .sp-window { height:clamp(120px,18vh,190px); border-radius:16px; border:2px solid var(--bdb-line); background:var(--bdb-card); display:grid; place-items:center; padding:10px; overflow:hidden; position:relative; }
        .sp-window.spin { animation:spShake 0.18s linear infinite; }
        .sp-window.win { box-shadow:0 0 0 3px currentColor inset, 0 0 30px -6px currentColor; }
        @keyframes spShake { 50%{transform:translateY(-2px);} }
        .sp-name { font-size:clamp(1.4rem,3.6vw,2.5rem); font-weight:800; text-align:center; line-height:1.05; color:var(--bdb-ink); }
        .sp-name.blur { filter:blur(1.5px); opacity:0.7; }

        .sp-spin-btn { font-size:1.4rem; font-weight:800; letter-spacing:0.04em; color:#fff; background:var(--bdb-coral); border:none; border-radius:14px; padding:18px 48px; cursor:pointer; box-shadow:0 10px 30px -12px var(--bdb-coral); transition:transform 120ms ease, filter 140ms; }
        .sp-spin-btn:hover { filter:brightness(1.05); transform:translateY(-1px); }
        .sp-spin-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }

        .sp-foot { padding:12px 24px; border-top:1px solid var(--bdb-line); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .sp-fair { display:flex; align-items:center; gap:8px; color:var(--bdb-ink-soft); font-size:0.85rem; font-weight:600; }
        .sp-hint { color:var(--bdb-ink-faint); font-size:0.82rem; font-weight:600; }

        .sp-editor { background:var(--bdb-card); border-top:1px solid var(--bdb-line); padding:18px 24px; display:grid; gap:14px; }
        .sp-editor h3 { margin:0; font-size:0.82rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--bdb-ink-soft); }
        .sp-cols { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
        @media (max-width:720px){ .sp-cols{ grid-template-columns:1fr; } }
        .sp-ta { width:100%; min-height:200px; background:var(--bdb-ground); border:1px solid var(--bdb-line); border-radius:10px; color:var(--bdb-ink); padding:12px; font-size:0.95rem; font-weight:600; line-height:1.6; resize:vertical; }
        .sp-ipad-list { display:grid; gap:6px; max-height:230px; overflow:auto; align-content:start; }
        .sp-ipad-row { display:flex; align-items:center; gap:9px; background:var(--bdb-ground); border:1px solid var(--bdb-line); border-radius:8px; padding:7px 11px; font-weight:600; font-size:0.9rem; cursor:pointer; }
        .sp-ipad-row.on { border-color:var(--bdb-amber); color:var(--bdb-brown); }
        .sp-empty { color:var(--bdb-ink-faint); font-weight:600; }
      `}</style>

      <header className="sp-top">
        <p className="sp-mark">Big Dog Math — Student Spinner</p>
        <div className="sp-tbtns">
          {classNames.length > 0 ? (
            <select className="sp-sel" value={current} onChange={(e) => saveCurrent(e.target.value)}>
              {classNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          ) : (
            <span className="sp-hint">No class yet →</span>
          )}
          <button className="sp-btn" onClick={addClass}>＋ Class</button>
          <div className="sp-toggle">
            <button className={wheels === 2 ? "on" : ""} onClick={() => setWheels(2)}>2 reels</button>
            <button className={wheels === 3 ? "on" : ""} onClick={() => setWheels(3)}>3 reels</button>
          </div>
          <button className="sp-btn" onClick={() => setEditing((v) => !v)}>{editing ? "Done" : "Class list"}</button>
          {onClose && <button className="sp-btn" onClick={onClose}>✕ Close</button>}
          {!onClose && <a className="sp-btn" href="/">Home</a>}
        </div>
      </header>

      <main className="sp-stage">
        <div className="sp-reels">
          {Array.from({ length: wheels }).map((_, i) => (
            <div className="sp-reel" key={i}>
              <p className="sp-reel-label" style={{ color: REEL_COLORS[i] }}>{labels[i]}</p>
              <div
                className={`sp-window${spinning && !landed[i] ? " spin" : ""}${landed[i] && !spinning && display[i] !== "—" ? " win" : ""}`}
                style={{ color: REEL_COLORS[i] }}
              >
                <span className={`sp-name${spinning && !landed[i] ? " blur" : ""}`}>{display[i] ?? "—"}</span>
              </div>
            </div>
          ))}
        </div>
        <button className="sp-spin-btn" onClick={spin} disabled={spinning || !current}>
          {spinning ? "Spinning…" : "🎰 SPIN"}
        </button>
      </main>

      <footer className="sp-foot">
        <label className="sp-fair">
          <input type="checkbox" checked={fair} onChange={(e) => saveFair(e.target.checked)} />
          Fair mode — everyone picked before repeats
        </label>
        <span className="sp-hint">
          {current ? `${allNames.length} students${wheels === 3 ? ` · ${ipadNames.length} iPad` : ""}` : "Add a class to begin"}
        </span>
      </footer>

      {editing && (
        <section className="sp-editor">
          <h3>
            {current ? `Class list — ${current}` : "Create a class first (＋ Class)"}
            {current && <button className="sp-btn" style={{ marginLeft: 12 }} onClick={deleteClass}>Delete class</button>}
          </h3>
          {current && (
            <div className="sp-cols">
              <div>
                <p className="sp-hint" style={{ marginTop: 0 }}>Paste students — one name per line</p>
                <textarea
                  className="sp-ta"
                  defaultValue={allNames.join("\n")}
                  key={current}
                  onBlur={(e) => updateNames(e.target.value)}
                  placeholder={"Ada Lovelace\nBlake Rivera\nCarmen Soto"}
                />
              </div>
              <div>
                <p className="sp-hint" style={{ marginTop: 0 }}>Tap a name to mark them an iPad student (3rd reel)</p>
                <div className="sp-ipad-list">
                  {allNames.length === 0 && <span className="sp-empty">Add names on the left first.</span>}
                  {allNames.map((n) => {
                    const on = ipadNames.includes(n);
                    return (
                      <div key={n} className={`sp-ipad-row${on ? " on" : ""}`} onClick={() => toggleIpad(n)}>
                        <span>{on ? "📱" : "○"}</span> {n}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
