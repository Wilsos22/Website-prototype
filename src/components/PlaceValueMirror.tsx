"use client";

// Place Value Mirror — the naming/structure companion to the odometer
// (Place Value Reader). Shows a number laid over seven labeled places,
// thousands through thousandths. Two ideas carry the whole tool: the places
// group in threes and repeat, and they MIRROR around the ones place — tens
// with tenths, hundreds with hundredths, thousands with thousandths (the name
// just gains "-ths"). The ones place is the mirror line, which is why there is
// no "oneths". Supports M1.T3 decimals (6.NS.3). Pure optional-support: no
// scoring.

import { useMemo, useState } from "react";

const C_TEAL = "#50a3a4";
const C_AMBER = "#fcaf38";
const C_CORAL = "#f95335";
const C_INK = "#201e1a";

interface Place { name: string; val: string; stroke: string; text: string }
const PLACES: Place[] = [
  { name: "thousands", val: "1000", stroke: C_TEAL, text: "#2f7e7d" },
  { name: "hundreds", val: "100", stroke: C_AMBER, text: "#a9740f" },
  { name: "tens", val: "10", stroke: C_CORAL, text: "#c23b22" },
  { name: "ones", val: "1", stroke: C_INK, text: C_INK },
  { name: "tenths", val: "0.1", stroke: C_CORAL, text: "#c23b22" },
  { name: "hundredths", val: "0.01", stroke: C_AMBER, text: "#a9740f" },
  { name: "thousandths", val: "0.001", stroke: C_TEAL, text: "#2f7e7d" },
];

// Fixed pixel layout so the connecting arcs land exactly on the card centers.
const CARD_X = [0, 92, 184, 276, 384, 476, 568];
const CX = [42, 134, 226, 318, 426, 518, 610];
const CARD_W = 84;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function worthStr(i: number, d: number): string {
  if (d === 0) return "0";
  switch (i) {
    case 0: return `${d * 1000}`;
    case 1: return `${d * 100}`;
    case 2: return `${d * 10}`;
    case 3: return `${d}`;
    case 4: return `0.${d}`;
    case 5: return `0.0${d}`;
    default: return `0.00${d}`;
  }
}

const PRESETS = ["3452.678", "40.05", "700.007", "268.4"];

export default function PlaceValueMirror() {
  const [raw, setRaw] = useState("3452.678");
  const [selected, setSelected] = useState<number | null>(null);

  const micros = useMemo(() => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.round(clamp(n, 0, 9999.999) * 1000);
  }, [raw]);

  const digits = PLACES.map((_, i) => Math.floor(micros / 10 ** (6 - i)) % 10);
  const intPart = Math.floor(micros / 1000);
  const frac = micros % 1000;
  const valueText = frac === 0 ? `${intPart}` : `${intPart}.${String(frac).padStart(3, "0")}`;
  const expanded = digits.map((d, i) => (d > 0 ? worthStr(i, d) : null)).filter(Boolean).join(" + ") || "0";

  function explain(i: number): string {
    const p = PLACES[i];
    const worth = worthStr(i, digits[i]);
    if (i === 3) return `The ones place is the mirror line. Every other place reflects across it — that is why there is no "oneths".`;
    const partner = PLACES[6 - i];
    return `The ${p.name} place holds ${digits[i]}, worth ${worth}. It mirrors the ${partner.name} place — the same number of steps from the ones, with "-ths" added to the name.`;
  }

  return (
    <div className="pm-wrap">
      <style>{`
        .pm-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:780px; margin:0 auto; padding:16px clamp(10px,3vw,20px) 34px; }
        .pm-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:2px 0 4px; }
        .pm-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.92rem; margin:0 0 14px; }
        .pm-chartwrap { overflow-x:auto; padding:4px 2px; }
        .pm-svg { display:block; margin:0 auto; width:100%; min-width:560px; max-width:720px; height:auto; }
        .pm-card { cursor:pointer; }
        .pm-readout { text-align:center; margin:16px auto 0; }
        .pm-value { font-size:clamp(1.7rem,6vw,2.6rem); font-weight:900; letter-spacing:0.02em; }
        .pm-expanded { color:var(--bdb-ink-soft); font-weight:700; font-size:clamp(1rem,3vw,1.2rem); margin-top:4px; min-height:24px; }
        .pm-explain { max-width:520px; margin:12px auto 0; text-align:center; font-weight:700; font-size:clamp(1rem,2.9vw,1.18rem); line-height:1.5; border:2px solid var(--bdb-line); background:var(--bdb-card); border-radius:12px; padding:12px 16px; }
        .pm-controls { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; align-items:center; margin-top:20px; }
        .pm-input { width:150px; font:inherit; font-size:1.2rem; font-weight:900; text-align:center; padding:9px; border:3px solid var(--bdb-ink); border-radius:0; background:#fff; color:var(--bdb-ink); }
        .pm-pill { font:inherit; font-weight:800; font-size:0.9rem; min-height:42px; padding:0 14px; border-radius:999px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink-soft); cursor:pointer; }
        .pm-pill:active { background:var(--bdb-ground-2); color:var(--bdb-ink); }
      `}</style>

      <div className="pm-prompt">The places group in threes and mirror around the ones</div>
      <div className="pm-sub">Tap any place to see its name, its value, and its mirror. Type a number to fill the chart.</div>

      <div className="pm-chartwrap">
        <svg className="pm-svg" viewBox="0 0 652 225" role="img" aria-label={`Place value chart showing ${valueText} across thousands to thousandths`}>
          {/* period brackets */}
          <text x="42" y="18" textAnchor="middle" fontSize="11" fill="var(--bdb-ink-faint)">next 3</text>
          <path d="M92,30 L92,26 L360,26 L360,30" fill="none" stroke="var(--bdb-ink-faint)" strokeWidth="1.5" />
          <text x="226" y="18" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--bdb-ink-soft)">a group of 3</text>
          <path d="M384,30 L384,26 L652,26 L652,30" fill="none" stroke="var(--bdb-ink-faint)" strokeWidth="1.5" />
          <text x="518" y="18" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--bdb-ink-soft)">its mirror</text>

          {/* mirror line through the ones place */}
          <line x1="318" y1="34" x2="318" y2="150" stroke="var(--bdb-ink-faint)" strokeDasharray="4 4" strokeWidth="1.5" />

          {/* cards */}
          {PLACES.map((p, i) => {
            const isSel = selected === i;
            const isPartner = selected !== null && selected !== 3 && 6 - selected === i;
            const fill = `color-mix(in srgb, ${p.stroke} ${i === 3 ? 16 : 10}%, var(--bdb-card))`;
            return (
              <g key={p.name} className="pm-card" onClick={() => setSelected(isSel ? null : i)}>
                <rect x={CARD_X[i]} y={40} width={CARD_W} height={66} rx={12}
                  fill={fill} stroke={p.stroke} strokeWidth={isSel ? 4 : isPartner ? 3 : 2}
                  opacity={selected === null || isSel || isPartner ? 1 : 0.55} />
                <text x={CX[i]} y={86} textAnchor="middle" fontSize="34" fontWeight="900" fill="var(--bdb-ink)">{digits[i]}</text>
                <text x={CX[i]} y={126} textAnchor="middle" fontSize="14" fontWeight="800" fill={p.text}>{p.name}</text>
                <text x={CX[i]} y={143} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--bdb-ink-faint)">{p.val}</text>
              </g>
            );
          })}

          {/* decimal point */}
          <circle cx="372" cy="99" r="5" fill={C_CORAL} />

          {/* mirror arcs */}
          <path d="M226,152 Q326,182 426,152" fill="none" stroke={C_CORAL} strokeWidth="2" />
          <path d="M134,156 Q326,196 518,156" fill="none" stroke={C_AMBER} strokeWidth="2.5" />
          <path d="M42,160 Q326,214 610,160" fill="none" stroke={C_TEAL} strokeWidth="2.5" />
        </svg>
      </div>

      <div className="pm-readout">
        <div className="pm-value">{valueText}</div>
        <div className="pm-expanded">{expanded}</div>
      </div>

      {selected !== null && <div className="pm-explain">{explain(selected)}</div>}

      <div className="pm-controls">
        <input className="pm-input" value={raw} inputMode="decimal" aria-label="number to show"
          onChange={(e) => { setRaw(e.target.value.replace(/[^0-9.]/g, "")); }} />
        {PRESETS.map((n) => (
          <button key={n} className="pm-pill" onClick={() => setRaw(n)}>{n}</button>
        ))}
        <button className="pm-pill" onClick={() => { setRaw("0"); setSelected(null); }}>Clear</button>
      </div>
    </div>
  );
}
