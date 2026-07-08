"use client";

// Distributive Area Method — decompose a product by splitting the rectangle.
// Enter a x b, drag a snapping line to split each side wherever you want (any
// split is allowed — the point is to discover that only friendly splits make the
// multiplying easier), color the regions, then fill each region's partial
// product and combine them. Squared corners + a unit grid, on purpose.

import { useCallback, useMemo, useRef, useState } from "react";
import { reportToolResult } from "@/lib/toolEvidence";

type Phase = "enter" | "split" | "products" | "combine" | "done";
const REGION_COLORS = ["#50a3a4", "#fcaf38", "#f95335", "#7c5cd6"];

interface Region { id: number; tw: number; th: number; color: string; x: number; y: number; w: number; h: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const friendly = (n: number) => n % 10 === 0 || n === 5 || n < 10; // tens, five, single digits

function cellSize(top: number, side: number) {
  return Math.max(13, Math.min(26, Math.floor(Math.min(460 / top, 320 / side))));
}

export default function DistributiveAreaMethod() {
  const [phase, setPhase] = useState<Phase>("enter");
  const [top, setTop] = useState(18);
  const [side, setSide] = useState(14);
  const [inTop, setInTop] = useState("18");
  const [inSide, setInSide] = useState("14");

  const [splitStep, setSplitStep] = useState<"top" | "side">("top");
  const [topSplit, setTopSplit] = useState<number | null>(null);
  const [sideSplit, setSideSplit] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const [regions, setRegions] = useState<Region[]>([]);
  const [active, setActive] = useState(0);
  const [entry, setEntry] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [totalEntry, setTotalEntry] = useState("");

  const rectRef = useRef<HTMLDivElement | null>(null);
  const cell = useMemo(() => cellSize(top, side), [top, side]);
  const solvedRef = useRef(false);

  const start = useCallback(() => {
    const t = clamp(Math.round(Number(inTop) || 0), 2, 20);
    const s = clamp(Math.round(Number(inSide) || 0), 2, 20);
    setTop(t); setSide(s);
    setTopSplit(null); setSideSplit(null); setSplitStep("top"); setHover(null);
    setRegions([]); setActive(0); setEntry(""); setTotalEntry(""); setNote(null);
    solvedRef.current = false;
    setPhase("split");
  }, [inTop, inSide]);

  const buildRegions = useCallback((tSplit: number | null, sSplit: number | null) => {
    const c = cellSize(top, side);
    const topParts = tSplit ? [tSplit, top - tSplit] : [top];
    const sideParts = sSplit ? [sSplit, side - sSplit] : [side];
    const out: Region[] = [];
    let id = 0, y = 0;
    for (const th of sideParts) {
      let x = 0;
      for (const tw of topParts) {
        out.push({ id, tw, th, color: REGION_COLORS[id % 4], x: x * c, y: y * c, w: tw * c, h: th * c });
        id += 1; x += tw;
      }
      y += th;
    }
    setRegions(out);
    setActive(0); setEntry(""); setNote(null);
    setPhase("products");
  }, [top, side]);

  // Split interaction: a line snaps to gridlines under the cursor.
  const onMove = (e: React.MouseEvent) => {
    if (phase !== "split") return;
    const r = rectRef.current?.getBoundingClientRect();
    if (!r) return;
    if (splitStep === "top") setHover(clamp(Math.round((e.clientX - r.left) / cell), 1, top - 1));
    else setHover(clamp(Math.round((e.clientY - r.top) / cell), 1, side - 1));
  };
  const commitSplit = () => {
    if (phase !== "split" || hover == null) return;
    if (splitStep === "top") {
      setTopSplit(hover); setHover(null);
      if (side > 1) setSplitStep("side"); else buildRegions(hover, null);
    } else {
      setSideSplit(hover); setHover(null); buildRegions(topSplit, hover);
    }
  };
  const keepWhole = () => {
    if (splitStep === "top") { setTopSplit(null); setHover(null); setSplitStep("side"); }
    else { setSideSplit(null); setHover(null); buildRegions(topSplit, null); }
  };

  const submitProduct = () => {
    const r = regions[active];
    if (!r) return;
    if (Number(entry) === r.tw * r.th) {
      setEntry(""); setNote(null);
      if (active + 1 < regions.length) setActive(active + 1);
      else setPhase("combine");
    } else {
      setNote(`Not yet — that region is ${r.tw} x ${r.th}.`);
    }
  };
  const submitTotal = () => {
    const sum = regions.reduce((a, r) => a + r.tw * r.th, 0);
    if (Number(totalEntry) === sum) {
      setNote(null);
      if (!solvedRef.current) { solvedRef.current = true; reportToolResult({ tool: "distributive-area", correct: true, problemId: `${top}x${side}` }); }
      setPhase("done");
    } else setNote("Add the partial products again.");
  };

  const total = top * side;
  const parts = regions.map((r) => r.tw * r.th);
  const splitWasFriendly = (topSplit == null || friendly(topSplit) && friendly(top - topSplit)) && (sideSplit == null || friendly(sideSplit) && friendly(side - sideSplit));

  return (
    <div className="da-wrap">
      <style>{`
        .da-wrap { font-family:var(--bdb-font); color:var(--bdb-ink); max-width:760px; margin:0 auto; padding:14px clamp(10px,3vw,20px) 30px; }
        .da-prompt { text-align:center; font-size:clamp(1.1rem,3.2vw,1.5rem); font-weight:800; margin:2px 0 4px; min-height:32px; }
        .da-sub { text-align:center; color:var(--bdb-ink-soft); font-size:0.9rem; margin:0 0 14px; min-height:20px; }
        .da-enter { display:flex; gap:10px; align-items:center; justify-content:center; margin:24px 0; flex-wrap:wrap; }
        .da-in { width:84px; font:inherit; font-size:1.6rem; font-weight:800; text-align:center; padding:8px; border:2px solid var(--bdb-line); border-radius:12px; background:var(--bdb-card); color:var(--bdb-ink); }
        .da-x { font-size:1.6rem; font-weight:800; color:var(--bdb-ink-soft); }
        .da-stage { position:relative; margin:0 auto; width:max-content; padding:44px 0 0 44px; }
        .da-rect { position:relative; border:3px solid var(--bdb-ink); border-radius:0; cursor:crosshair; }
        .da-topnum, .da-sidenum { position:absolute; font-weight:900; color:var(--bdb-ink); }
        .da-line { position:absolute; background:var(--bdb-coral); z-index:5; pointer-events:none; }
        .da-partlbl { position:absolute; font-weight:900; color:var(--bdb-coral); font-size:0.95rem; z-index:6; pointer-events:none; }
        .da-region { position:absolute; border-radius:0; display:grid; place-items:center; text-align:center; transition:background 200ms; }
        .da-region.on { outline:3px solid var(--bdb-ink); outline-offset:-3px; }
        .da-region.solved .da-prod { animation:daDrop 320ms cubic-bezier(.2,.8,.3,1); }
        @keyframes daDrop { from { transform:translateY(-10px) scale(1.2); opacity:0; } to { transform:none; opacity:1; } }
        .da-dims { font-weight:800; font-size:0.9rem; color:var(--bdb-ink); opacity:0.75; }
        .da-prod { font-weight:900; font-size:1.3rem; color:var(--bdb-ink); }
        .da-pin { width:74px; font:inherit; font-size:1.1rem; font-weight:800; text-align:center; padding:5px; border:2px solid var(--bdb-ink); border-radius:8px; background:#fff; }
        .da-bar { display:flex; gap:8px; justify-content:center; align-items:center; margin-top:16px; flex-wrap:wrap; }
        .da-btn { font:inherit; font-weight:700; font-size:0.9rem; padding:9px 16px; border-radius:11px; border:1px solid var(--bdb-line); background:var(--bdb-ink); color:#fff; cursor:pointer; }
        .da-btn.ghost { background:var(--bdb-card); color:var(--bdb-ink); }
        .da-note { text-align:center; color:var(--bdb-coral); font-weight:700; font-size:0.9rem; min-height:20px; margin-top:8px; }
        .da-combine { text-align:center; font-size:clamp(1.2rem,3.5vw,1.7rem); font-weight:800; margin:18px 0; }
        .da-done { text-align:center; }
        .da-done .eq { font-size:clamp(1.3rem,4vw,2rem); font-weight:900; margin:6px 0; }
        .da-reflect { color:var(--bdb-ink-soft); font-size:0.95rem; max-width:460px; margin:10px auto 0; line-height:1.5; }
      `}</style>

      {phase === "enter" && (
        <>
          <div className="da-prompt">Break apart a multiplication problem</div>
          <div className="da-sub">Pick any two numbers, then split the rectangle however you want.</div>
          <div className="da-enter">
            <input className="da-in" value={inTop} onChange={(e) => setInTop(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="first factor" />
            <span className="da-x">x</span>
            <input className="da-in" value={inSide} onChange={(e) => setInSide(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="second factor" />
          </div>
          <div className="da-bar"><button className="da-btn" onClick={start}>Build the rectangle</button></div>
        </>
      )}

      {phase !== "enter" && (
        <>
          <div className="da-prompt">
            {phase === "split" && splitStep === "top" && `Split the ${top} wherever you like`}
            {phase === "split" && splitStep === "side" && `Now split the ${side} wherever you like`}
            {phase === "products" && regions[active] && `${regions[active].tw} x ${regions[active].th} = ?`}
            {phase === "combine" && "Combine the pieces"}
            {phase === "done" && `${top} x ${side} = ${total}`}
          </div>
          <div className="da-sub">
            {phase === "split" && "Friendly numbers like tens make the multiplying easier — but try any split and see."}
            {phase === "products" && "Fill in this region's area, then the next."}
            {phase === "combine" && "Add every region's product for the whole area."}
            {phase === "done" && "Same total area, no matter how you cut it up."}
          </div>

          <div className="da-stage">
            {/* top factor labels */}
            {phase === "split" || regions.length === 0 ? (
              <div className="da-topnum" style={{ top: 12, left: 44 + (top * cell) / 2 - 8, fontSize: "1.4rem" }}>{top}</div>
            ) : (
              (topSplit ? [topSplit, top - topSplit] : [top]).map((p, i, arr) => {
                const before = arr.slice(0, i).reduce((a, b) => a + b, 0);
                return <div key={i} className="da-topnum" style={{ top: 12, left: 44 + (before + p / 2) * cell - 8, fontSize: "1.3rem", color: REGION_COLORS[i] }}>{p}</div>;
              })
            )}
            {/* side factor labels */}
            {phase === "split" || regions.length === 0 ? (
              <div className="da-sidenum" style={{ left: 12, top: 44 + (side * cell) / 2 - 10, fontSize: "1.4rem" }}>{side}</div>
            ) : (
              (sideSplit ? [sideSplit, side - sideSplit] : [side]).map((p, i, arr) => {
                const before = arr.slice(0, i).reduce((a, b) => a + b, 0);
                return <div key={i} className="da-sidenum" style={{ left: 12, top: 44 + (before + p / 2) * cell - 10, fontSize: "1.3rem", color: REGION_COLORS[i * 2 % 4] }}>{p}</div>;
              })
            )}

            <div
              ref={rectRef}
              className="da-rect"
              style={{
                width: top * cell, height: side * cell,
                backgroundImage: "linear-gradient(to right, rgba(32,30,26,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(32,30,26,0.08) 1px, transparent 1px)",
                backgroundSize: `${cell}px ${cell}px`,
              }}
              onMouseMove={onMove}
              onMouseLeave={() => phase === "split" && setHover(null)}
              onClick={commitSplit}
            >
              {/* committed regions */}
              {regions.map((r, i) => (
                <div
                  key={r.id}
                  className={`da-region ${phase === "products" && i === active ? "on" : ""} ${(phase === "products" && i < active) || phase === "combine" || phase === "done" ? "solved" : ""}`}
                  style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: `color-mix(in srgb, ${r.color} 26%, transparent)` }}
                >
                  {(phase === "products" && i < active) || phase === "combine" || phase === "done" ? (
                    <span className="da-prod">{r.tw * r.th}</span>
                  ) : phase === "products" && i === active ? (
                    <div>
                      <div className="da-dims">{r.tw} x {r.th}</div>
                      <input className="da-pin" autoFocus value={entry} inputMode="numeric"
                        onChange={(e) => setEntry(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => e.key === "Enter" && submitProduct()} onClick={(e) => e.stopPropagation()} />
                    </div>
                  ) : (
                    <span className="da-dims">{r.tw} x {r.th}</span>
                  )}
                </div>
              ))}

              {/* live split line + part labels */}
              {phase === "split" && hover != null && splitStep === "top" && (
                <>
                  <div className="da-line" style={{ left: hover * cell - 1.5, top: 0, width: 3, height: side * cell }} />
                  <div className="da-partlbl" style={{ left: (hover / 2) * cell - 8, top: -22 }}>{hover}</div>
                  <div className="da-partlbl" style={{ left: (hover + (top - hover) / 2) * cell - 8, top: -22 }}>{top - hover}</div>
                </>
              )}
              {phase === "split" && hover != null && splitStep === "side" && (
                <>
                  <div className="da-line" style={{ top: hover * cell - 1.5, left: 0, height: 3, width: top * cell }} />
                  <div className="da-partlbl" style={{ top: (hover / 2) * cell - 8, left: -26 }}>{hover}</div>
                  <div className="da-partlbl" style={{ top: (hover + (side - hover) / 2) * cell - 8, left: -26 }}>{side - hover}</div>
                </>
              )}
            </div>
          </div>

          {phase === "split" && (
            <div className="da-bar">
              <button className="da-btn ghost" onClick={keepWhole}>Keep the {splitStep === "top" ? top : side} whole</button>
              <span style={{ color: "var(--bdb-ink-faint)", fontSize: "0.85rem" }}>{hover != null ? "Click to lock this split" : "Move over the rectangle to place a split"}</span>
            </div>
          )}

          {phase === "products" && <div className="da-bar"><button className="da-btn" onClick={submitProduct}>Enter</button></div>}

          {phase === "combine" && (
            <>
              <div className="da-combine">{parts.join(" + ")} = </div>
              <div className="da-bar">
                <input className="da-in" style={{ width: 120 }} value={totalEntry} inputMode="numeric"
                  onChange={(e) => setTotalEntry(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submitTotal()} aria-label="total" />
                <button className="da-btn" onClick={submitTotal}>Check</button>
              </div>
            </>
          )}

          {phase === "done" && (
            <div className="da-done">
              <div className="eq">{parts.join(" + ")} = {total}</div>
              <p className="da-reflect">
                {splitWasFriendly
                  ? "Nice — friendly pieces made those products quick to do in your head."
                  : "Notice those weren't the easiest numbers to multiply. The area is still right, but a split into tens usually makes the mental math simpler. Try one."}
              </p>
              <div className="da-bar"><button className="da-btn" onClick={() => setPhase("enter")}>New problem</button></div>
            </div>
          )}

          <div className="da-note">{note}</div>
        </>
      )}
    </div>
  );
}
