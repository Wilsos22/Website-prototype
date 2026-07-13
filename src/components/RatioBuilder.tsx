"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";

type TileColor = "blue" | "yellow";

interface RatioTile {
  id: string;
  color: TileColor;
}

interface RatioBuilderProps {
  prompt?: string;
  kicker?: string;
  presentation?: boolean;
  compact?: boolean;
}

function newTile(color: TileColor): RatioTile {
  return { id: crypto.randomUUID(), color };
}

export default function RatioBuilder({
  prompt = "Build 3 blue parts for every 2 yellow parts. Then compare blue to yellow and blue to the whole.",
  kicker = "Representational model",
  presentation = false,
  compact = false,
}: RatioBuilderProps) {
  const [tiles, setTiles] = useState<RatioTile[]>([]);
  const [blueToYellow, setBlueToYellow] = useState("");
  const [blueToWhole, setBlueToWhole] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const blue = tiles.filter((tile) => tile.color === "blue").length;
    const yellow = tiles.length - blue;
    return { blue, yellow, whole: tiles.length };
  }, [tiles]);

  useEffect(() => {
    if (!compact) return;
    setTiles([
      newTile("blue"),
      newTile("blue"),
      newTile("blue"),
      newTile("yellow"),
      newTile("yellow"),
    ]);
  }, [compact]);

  function addTile(color: TileColor) {
    setTiles((current) => [...current, newTile(color)]);
  }

  function handlePaletteDrag(event: DragEvent<HTMLButtonElement>, color: TileColor) {
    event.dataTransfer.setData("application/x-ratio-color", color);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleTileDrag(event: DragEvent<HTMLButtonElement>, id: string) {
    setDraggingId(id);
    event.dataTransfer.setData("application/x-ratio-tile", id);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const color = event.dataTransfer.getData("application/x-ratio-color") as TileColor;
    if (color === "blue" || color === "yellow") {
      addTile(color);
      return;
    }
    const id = event.dataTransfer.getData("application/x-ratio-tile");
    if (!id) return;
    setTiles((current) => {
      const selected = current.find((tile) => tile.id === id);
      if (!selected) return current;
      return [...current.filter((tile) => tile.id !== id), selected];
    });
    setDraggingId(null);
  }

  function reset() {
    setTiles([]);
    setBlueToYellow("");
    setBlueToWhole("");
    setDraggingId(null);
  }

  function loadExample() {
    setTiles([
      newTile("blue"),
      newTile("blue"),
      newTile("blue"),
      newTile("yellow"),
      newTile("yellow"),
    ]);
  }

  return (
    <section className={`ratio-builder${presentation ? " is-presentation" : ""}${compact ? " is-compact" : ""}`}>
      <style>{`
        .ratio-builder { min-height:100%; display:grid; align-content:start; gap:18px; background:var(--bdb-ground); color:var(--bdb-ink); padding:clamp(18px,3vw,38px); font-family:var(--bdb-font); }
        .ratio-builder.is-compact { min-height:0; padding:0; gap:10px; background:transparent; box-shadow:none; }
        .rb-head { display:grid; gap:8px; }
        .rb-kicker { margin:0; color:var(--bdb-teal); font-size:0.72rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .rb-prompt { margin:0; max-width:34ch; font-size:clamp(1.45rem,3.6vw,3.2rem); line-height:1.08; letter-spacing:-0.025em; }
        .is-compact .rb-prompt { font-size:clamp(1.15rem,2.2vw,1.65rem); }
        .rb-layout { display:grid; grid-template-columns:minmax(170px,0.36fr) minmax(0,1fr); gap:16px; align-items:stretch; }
        .rb-palette, .rb-work, .rb-write { border:1px solid var(--bdb-line); border-radius:var(--bdb-r); background:var(--bdb-card); box-shadow:var(--bdb-shadow-sm); }
        .rb-palette { display:grid; align-content:start; gap:12px; padding:16px; }
        .rb-label { margin:0; color:var(--bdb-ink-faint); font-size:0.68rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .rb-piece { min-height:68px; display:grid; place-items:center; border:0; border-radius:12px; color:#fff; cursor:grab; font:inherit; font-size:0.86rem; font-weight:900; }
        .rb-piece:active { cursor:grabbing; }
        .rb-piece.blue, .rb-tile.blue { background:#4d8df6; }
        .rb-piece.yellow, .rb-tile.yellow { background:#efae2e; color:#2c2415; }
        .rb-help { margin:0; color:var(--bdb-ink-soft); font-size:0.78rem; line-height:1.35; font-weight:650; }
        .rb-work { min-height:230px; display:grid; grid-template-rows:auto 1fr auto; gap:12px; padding:16px; }
        .rb-mat { min-height:132px; display:flex; align-content:flex-start; align-items:flex-start; gap:10px; flex-wrap:wrap; border:2px dashed #d9cfbd; border-radius:14px; background:#fbf7ef; padding:15px; }
        .rb-mat.is-empty { align-items:center; justify-content:center; color:var(--bdb-ink-faint); font-weight:800; text-align:center; }
        .rb-tile { width:72px; height:72px; border:0; border-radius:10px; box-shadow:0 7px 15px rgba(32,30,26,0.12); cursor:grab; }
        .rb-tile.is-dragging { opacity:0.45; }
        .rb-counts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
        .rb-count { border-radius:10px; background:var(--bdb-ground-2); padding:9px 10px; text-align:center; }
        .rb-count strong { display:block; font-size:1.35rem; }
        .rb-count span { display:block; color:var(--bdb-ink-soft); font-size:0.7rem; font-weight:850; text-transform:uppercase; letter-spacing:0.06em; }
        .rb-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .rb-action { min-height:42px; border:1px solid var(--bdb-line); border-radius:10px; background:var(--bdb-card); color:var(--bdb-ink); padding:0 14px; font:inherit; font-size:0.8rem; font-weight:850; cursor:pointer; }
        .rb-action.primary { border-color:var(--bdb-teal); background:var(--bdb-teal); color:#fff; }
        .rb-write { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; padding:16px; }
        .rb-field { display:grid; gap:6px; color:var(--bdb-ink-soft); font-size:0.78rem; font-weight:850; }
        .rb-field input { width:100%; min-height:48px; border:1px solid var(--bdb-line); border-radius:10px; background:#fff; color:var(--bdb-ink); padding:9px 12px; font:inherit; font-size:1rem; font-weight:800; }
        .rb-note { margin:0; color:var(--bdb-ink-faint); font-size:0.74rem; font-weight:700; }
        .is-presentation .rb-prompt { max-width:42ch; }
        .is-presentation .rb-layout { grid-template-columns:minmax(190px,0.3fr) minmax(0,1fr); }
        .is-presentation .rb-tile { width:88px; height:88px; }
        .is-compact .rb-kicker { font-size:0.62rem; }
        .is-compact .rb-prompt { max-width:none; font-size:0.85rem; line-height:1.25; letter-spacing:0; }
        .is-compact .rb-layout { grid-template-columns:1fr; }
        .is-compact .rb-palette, .is-compact .rb-label, .is-compact .rb-counts, .is-compact .rb-write, .is-compact .rb-note { display:none; }
        .is-compact .rb-work { min-height:0; gap:9px; border:0; border-radius:0; background:transparent; padding:0; box-shadow:none; }
        .is-compact .rb-mat { min-height:48px; align-items:center; flex-wrap:nowrap; gap:7px; border:0; border-radius:0; background:transparent; padding:0; }
        .is-compact .rb-tile { width:36px; height:36px; flex:none; border-radius:8px; }
        .is-compact .rb-action { min-height:30px; border:0; background:transparent; padding:0 8px 0 0; color:var(--bdb-ink-soft); font-size:0.62rem; text-transform:uppercase; letter-spacing:0.07em; }
        .is-compact .rb-action.primary { color:var(--bdb-teal); }
        @media (max-width:720px) {
          .ratio-builder { padding:14px; }
          .rb-layout { grid-template-columns:1fr; }
          .rb-palette { grid-template-columns:1fr 1fr; }
          .rb-palette .rb-label, .rb-palette .rb-help { grid-column:1 / -1; }
          .rb-write { grid-template-columns:1fr; }
          .rb-tile { width:58px; height:58px; }
        }
      `}</style>

      <header className="rb-head">
        <p className="rb-kicker">{kicker}</p>
        <h1 className="rb-prompt">{prompt}</h1>
      </header>

      <div className="rb-layout">
        <aside className="rb-palette" aria-label="Ratio pieces">
          <p className="rb-label">Drag or tap a part</p>
          <button className="rb-piece blue" draggable onDragStart={(event) => handlePaletteDrag(event, "blue")} onClick={() => addTile("blue")}>Blue part</button>
          <button className="rb-piece yellow" draggable onDragStart={(event) => handlePaletteDrag(event, "yellow")} onClick={() => addTile("yellow")}>Yellow part</button>
          <p className="rb-help">Drop pieces onto the work mat. The model stays on this screen only.</p>
        </aside>

        <div className="rb-work">
          <p className="rb-label">Build the relationship</p>
          <div
            className={`rb-mat${tiles.length === 0 ? " is-empty" : ""}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            {tiles.length === 0 ? "Drop blue and yellow parts here" : tiles.map((tile) => (
              <button
                key={tile.id}
                className={`rb-tile ${tile.color}${draggingId === tile.id ? " is-dragging" : ""}`}
                aria-label={`${tile.color} part`}
                draggable
                onDragStart={(event) => handleTileDrag(event, tile.id)}
                onDragEnd={() => setDraggingId(null)}
              />
            ))}
          </div>
          <div className="rb-counts" aria-label="Current counts">
            <div className="rb-count"><strong>{counts.blue}</strong><span>blue</span></div>
            <div className="rb-count"><strong>{counts.yellow}</strong><span>yellow</span></div>
            <div className="rb-count"><strong>{counts.whole}</strong><span>whole</span></div>
          </div>
          <div className="rb-actions">
            <button className="rb-action primary" onClick={loadExample}>Build 3 to 2</button>
            <button className="rb-action" onClick={() => setTiles((current) => current.slice(0, -1))} disabled={tiles.length === 0}>Remove last</button>
            <button className="rb-action" onClick={reset} disabled={tiles.length === 0 && !blueToYellow && !blueToWhole}>Reset</button>
          </div>
        </div>
      </div>

      {!presentation && (
        <div className="rb-write">
          <label className="rb-field">
            Blue to yellow
            <input value={blueToYellow} onChange={(event) => setBlueToYellow(event.target.value)} placeholder="Write the ratio in words or symbols" />
          </label>
          <label className="rb-field">
            Blue to the whole
            <input value={blueToWhole} onChange={(event) => setBlueToWhole(event.target.value)} placeholder="Name the whole before writing" />
          </label>
        </div>
      )}

      <p className="rb-note">This is a quick model for teacher observation. It is not scored or saved.</p>
    </section>
  );
}
