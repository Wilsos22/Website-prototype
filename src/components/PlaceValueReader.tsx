"use client";

// Place Value Reader — the gas-pump odometer for M1.T3 decimals (6.NS.3,
// supports M1.T3.L2-D1 Adding and Subtracting Decimals). Six digit wheels,
// hundreds through thousandths, with the decimal point in the middle. Bumping
// a place rolls that wheel; a wheel passing 9 rolls to 0 and carries 1 into
// the wheel on its left (subtraction is the same roll in reverse — a 0 rolls
// back to 9 and borrows 1). The roll runs straight across the decimal point,
// so 0.9 + 0.1 visibly becomes 1.0. Pure optional-support sandbox: no scoring.

import { ReactNode, useEffect, useRef, useState } from "react";

const C_TEAL = "#50a3a4";
const C_CORAL = "#f95335";

// Value is stored as an integer count of thousandths (micros) to dodge float
// error. Six wheels: 10^5 micros (hundreds) down to 10^0 micros (thousandths).
const MAXV = 999999; // 999.999
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const unitMicros = (i: number) => 10 ** (5 - i); // wheel i, i=0..5
const digitAt = (micros: number, i: number) => Math.floor(micros / 10 ** (5 - i)) % 10;

const PLACES = [
  { name: "hundreds", tag: "100" },
  { name: "tens", tag: "10" },
  { name: "ones", tag: "1" },
  { name: "tenths", tag: "0.1" },
  { name: "hundredths", tag: "0.01" },
  { name: "thousandths", tag: "0.001" },
];

function worthStr(i: number, d: number): string {
  switch (i) {
    case 0: return `${d * 100}`;
    case 1: return `${d * 10}`;
    case 2: return `${d}`;
    case 3: return `0.${d}`;
    case 4: return `0.0${d}`;
    default: return `0.00${d}`;
  }
}

// One odometer wheel. When its digit changes it rolls in `dir` (+1 rolls the
// old digit up and out, -1 rolls the new digit down in). `tick` forces the
// animation to replay on rapid consecutive bumps.
function Wheel({ digit, dir, tick, active, onTap }: { digit: number; dir: number; tick: number; active: boolean; onTap: () => void }) {
  const prev = useRef(digit);
  const [anim, setAnim] = useState<"up" | "dn" | null>(null);
  const [from, setFrom] = useState(digit);

  useEffect(() => {
    if (prev.current !== digit) {
      setFrom(prev.current);
      setAnim(dir >= 0 ? "up" : "dn");
      prev.current = digit;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digit, tick]);

  return (
    <button className={`pv-win ${active ? "active" : ""}`} onClick={onTap} aria-label={`digit ${digit}, tap for place value`}>
      {anim === "up" && (
        <div key={`u${tick}`} className="pv-strip pv-up" onAnimationEnd={() => setAnim(null)}>
          <div className="pv-cell">{from}</div>
          <div className="pv-cell">{digit}</div>
        </div>
      )}
      {anim === "dn" && (
        <div key={`d${tick}`} className="pv-strip pv-dn" onAnimationEnd={() => setAnim(null)}>
          <div className="pv-cell">{digit}</div>
          <div className="pv-cell">{from}</div>
        </div>
      )}
      {!anim && (
        <div className="pv-strip">
          <div className="pv-cell">{digit}</div>
        </div>
      )}
    </button>
  );
}

export default function PlaceValueReader() {
  const [micros, setMicros] = useState(0);
  const [dir, setDir] = useState(1);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const hold = useRef<{ t: ReturnType<typeof setTimeout> | null; iv: ReturnType<typeof setInterval> | null }>({ t: null, iv: null });

  function bump(i: number, sign: number) {
    setDir(sign);
    setTick((t) => t + 1);
    setMicros((m) => clamp(m + sign * unitMicros(i), 0, MAXV));
  }

  function stopHold() {
    if (hold.current.t) clearTimeout(hold.current.t);
    if (hold.current.iv) clearInterval(hold.current.iv);
    hold.current.t = hold.current.iv = null;
  }
  function startHold(fn: () => void, fast = false) {
    fn();
    if (fast) {
      hold.current.iv = setInterval(fn, 95);
    } else {
      hold.current.t = setTimeout(() => { hold.current.iv = setInterval(fn, 130); }, 320);
    }
  }
  useEffect(() => stopHold, []);

  const digits = PLACES.map((_, i) => digitAt(micros, i));
  const intPart = Math.floor(micros / 1000);
  const frac3 = String(micros % 1000).padStart(3, "0");
  const valueText = `${intPart}.${frac3}`;
  const expanded = digits
    .map((d, i) => (d > 0 ? worthStr(i, d) : null))
    .filter(Boolean)
    .join(" + ") || "0";

  const holdHandlers = (fn: () => void, fast = false) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); startHold(fn, fast); },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
  });

  return (
    <div className="pv-wrap">
      <style>{`
        .pv-wrap { --pv-cell:64px; font-family:var(--bdb-font); color:var(--bdb-ink); max-width:820px; margin:0 auto; padding:16px clamp(10px,3vw,20px) 36px; }
        .pv-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:2px 0 4px; }
        .pv-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.92rem; margin:0 0 18px; }
        .pv-readerwrap { overflow-x:auto; padding:6px 2px 4px; }
        .pv-reader { display:flex; gap:6px; align-items:flex-end; justify-content:center; width:max-content; margin:0 auto; }
        .pv-col { display:flex; flex-direction:column; align-items:center; gap:7px; }
        .pv-tag { font-size:0.74rem; font-weight:800; color:var(--bdb-ink-faint); min-height:16px; }
        .pv-step { width:46px; min-height:34px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink); border-radius:9px; font-size:1.1rem; font-weight:900; cursor:pointer; line-height:1; touch-action:none; }
        .pv-step:active { background:var(--bdb-ground-2); }
        .pv-win { width:50px; height:var(--pv-cell); overflow:hidden; padding:0; border:3px solid #2b2620; border-radius:9px; background:#1c1915; cursor:pointer; position:relative; box-shadow:inset 0 6px 8px rgba(0,0,0,0.55), inset 0 -6px 8px rgba(0,0,0,0.55); }
        .pv-win.active { border-color:${C_TEAL}; box-shadow:inset 0 6px 8px rgba(0,0,0,0.55), inset 0 -6px 8px rgba(0,0,0,0.55), 0 0 0 3px color-mix(in srgb, ${C_TEAL} 55%, transparent); }
        .pv-strip { display:flex; flex-direction:column; }
        .pv-cell { height:var(--pv-cell); display:grid; place-items:center; font-size:2.3rem; font-weight:900; color:#f7f2e6; }
        .pv-up { animation:pvUp .2s cubic-bezier(.4,.6,.4,1) forwards; }
        .pv-dn { animation:pvDn .2s cubic-bezier(.4,.6,.4,1) forwards; }
        @keyframes pvUp { from { transform:translateY(0); } to { transform:translateY(calc(-1 * var(--pv-cell))); } }
        @keyframes pvDn { from { transform:translateY(calc(-1 * var(--pv-cell))); } to { transform:translateY(0); } }
        .pv-dot { align-self:flex-end; margin:0 2px 20px; font-size:2.6rem; font-weight:900; color:${C_CORAL}; }
        .pv-readout { text-align:center; margin:20px auto 0; }
        .pv-value { font-size:clamp(1.8rem,6vw,2.8rem); font-weight:900; letter-spacing:0.02em; }
        .pv-expanded { color:var(--bdb-ink-soft); font-weight:700; font-size:clamp(1rem,3vw,1.25rem); margin-top:4px; min-height:24px; }
        .pv-name { max-width:460px; margin:12px auto 0; text-align:center; font-weight:700; font-size:clamp(1rem,2.9vw,1.2rem); line-height:1.5; color:var(--bdb-ink); border:2px solid color-mix(in srgb, ${C_TEAL} 40%, var(--bdb-line)); background:color-mix(in srgb, ${C_TEAL} 8%, var(--bdb-card)); border-radius:12px; padding:12px 16px; }
        .pv-name .hint { display:block; color:var(--bdb-ink-soft); font-weight:600; font-size:0.88rem; margin-top:4px; }
        .pv-bar { display:flex; gap:10px; justify-content:center; align-items:center; margin-top:22px; flex-wrap:wrap; }
        .pv-pump { font:inherit; font-weight:800; font-size:1rem; padding:13px 22px; border-radius:14px; border:2px solid #2b2620; background:#1c1915; color:#f7f2e6; cursor:pointer; touch-action:none; box-shadow:0 3px 0 #000; }
        .pv-pump:active { transform:translateY(2px); box-shadow:0 1px 0 #000; }
        .pv-btn { font:inherit; font-weight:700; font-size:0.92rem; padding:11px 18px; border-radius:12px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink); cursor:pointer; }
        @media (prefers-reduced-motion: reduce) { .pv-up, .pv-dn { animation-duration:.001s; } }
      `}</style>

      <div className="pv-prompt">Every wheel counts 0 to 9, then rolls</div>
      <div className="pv-sub">Bump a place with the arrows, or hold the pump. When a wheel passes 9 it rolls to 0 and adds 1 to the wheel on its left.</div>

      <div className="pv-readerwrap">
        <div className="pv-reader">
          {PLACES.map((p, i) => (
            <div key={p.name} style={{ display: "contents" }}>
              <div className="pv-col">
                <span className="pv-tag">{p.tag}</span>
                <button className="pv-step" aria-label={`add one ${p.name}`} {...holdHandlers(() => bump(i, 1))}>+</button>
                <Wheel digit={digits[i]} dir={dir} tick={tick} active={selected === i} onTap={() => setSelected(selected === i ? null : i)} />
                <button className="pv-step" aria-label={`subtract one ${p.name}`} {...holdHandlers(() => bump(i, -1))}>−</button>
              </div>
              {i === 2 && <span className="pv-dot" aria-hidden="true">.</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="pv-readout">
        <div className="pv-value">{valueText}</div>
        <div className="pv-expanded">{expanded}</div>
      </div>

      {selected !== null && (
        <div className="pv-name">
          The <b>{digits[selected]}</b> in the <b>{PLACES[selected].name}</b> place is worth <b>{worthStr(selected, digits[selected])}</b>.
          <span className="hint">Each place is 10 times the place on its right.</span>
        </div>
      )}

      <div className="pv-bar">
        <button className="pv-pump" {...holdHandlers(() => bump(5, 1), true)}>Hold to pump</button>
        <button className="pv-btn" onClick={() => { setMicros(0); setSelected(null); }}>Reset to 0</button>
      </div>
    </div>
  );
}
