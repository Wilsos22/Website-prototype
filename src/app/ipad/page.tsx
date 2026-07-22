"use client";

// iPad pen surface - write from anywhere in the room.
//
// Two surfaces, one toolbar:
//   Board            - the classic white board, mirrored on /board.
//   Write on screen  - the glass sheet: the live projector view (the
//                      /teacher/present stage) renders under a transparent
//                      ink layer, letterboxed to the projector's exact aspect
//                      ratio, so strokes land on the wall precisely where the
//                      pen put them. Covers everything the app shows; content
//                      outside the app still goes through Background.
//
// Pencil-first: fingers never mark unless "Finger draws" is switched on, so a
// resting palm cannot leave ink even before the first pen touch. The screen
// wake lock keeps the iPad awake through a whole lesson.

import { useEffect, useRef, useState } from "react";
import InkBoard, { type InkTool } from "@/components/InkBoard";
import { joinInkRoom, type InkChannel, type InkConnectionStatus } from "@/lib/inkSync";
import { BOARD_TEMPLATES } from "@/lib/boardTemplates";

function classroomDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

const COLORS = ["#111827", "#f95335", "#4d8df6", "#2f9e6f", "#fcaf38"];
const WIDTHS: { label: string; px: number }[] = [
  { label: "S", px: 3 },
  { label: "M", px: 6 },
  { label: "L", px: 12 },
];

type Surface = "board" | "screen";

// Per-page controls: each board page carries its own signals and furniture,
// so Undo, Clear, Background, and Problem always act on the page in view.
type PageState = {
  clear: number;
  undo: number;
  redo: number;
  exportSig: number;
  bg: string | null;
  problem: string | null;
};

const freshPage = (): PageState => ({ clear: 0, undo: 0, redo: 0, exportSig: 0, bg: null, problem: null });
const MAX_PAGES = 8;

export default function IpadPage() {
  const [room, setRoom] = useState("main");
  const [surface, setSurface] = useState<Surface>("board");
  const [color, setColor] = useState(COLORS[0]);
  const [tool, setTool] = useState<InkTool>("pen");
  const [penWidth, setPenWidth] = useState(6);
  const [fingerDraws, setFingerDraws] = useState(false);
  const [pages, setPages] = useState<PageState[]>([freshPage()]);
  const [activePage, setActivePage] = useState(0);
  const [showProblem, setShowProblem] = useState(false);
  const [screenClearSignal, setScreenClearSignal] = useState(0);
  const [undoSignal, setUndoSignal] = useState(0);
  const [redoSignal, setRedoSignal] = useState(0);
  const [scratchUndoSignal, setScratchUndoSignal] = useState(0);
  const [history, setHistory] = useState<{ undo: boolean; redo: boolean }>({ undo: false, redo: false });
  const [toast, setToast] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [scratchOpen, setScratchOpen] = useState(false);
  const [scratchClear, setScratchClear] = useState(0);
  const [boardStatus, setBoardStatus] = useState<InkConnectionStatus>("connecting");
  const [screenAr, setScreenAr] = useState(16 / 9);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const ctrlRef = useRef<InkChannel | null>(null);

  // Live values the ctrl-channel handler and history callbacks read.
  const activePageRef = useRef(0);
  useEffect(() => { activePageRef.current = activePage; }, [activePage]);
  const pageCountRef = useRef(1);
  useEffect(() => { pageCountRef.current = pages.length; }, [pages.length]);
  const scratchOpenRef = useRef(false);
  useEffect(() => { scratchOpenRef.current = scratchOpen; }, [scratchOpen]);
  const surfaceRef = useRef<Surface>("board");
  useEffect(() => { surfaceRef.current = surface; }, [surface]);
  const historiesRef = useRef<Record<number, { undo: boolean; redo: boolean }>>({});
  const screenHistoryRef = useRef({ undo: false, redo: false });

  const page = pages[activePage] ?? pages[0];

  function patchPage(i: number, patch: Partial<PageState>) {
    setPages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function bumpPage(key: "clear" | "undo" | "redo" | "exportSig") {
    setPages((ps) => ps.map((p, j) => (j === activePage ? { ...p, [key]: p[key] + 1 } : p)));
  }
  function flipTo(i: number) {
    setActivePage(i);
    setHistory(historiesRef.current[i] ?? { undo: false, redo: false });
  }
  function addPage() {
    if (pages.length >= MAX_PAGES) return;
    setPages((ps) => [...ps, freshPage()]);
    flipTo(pages.length);
  }
  function switchSurface(next: Surface) {
    setSurface(next);
    setHistory(next === "board"
      ? historiesRef.current[activePage] ?? { undo: false, redo: false }
      : screenHistoryRef.current);
  }

  function flashToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4500);
  }

  // Export downloads a copy and publishes it through the protected teacher API.
  async function handleExport(dataUrl: string) {
    const date = classroomDate();
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `big-dog-board-${date}.png`;
    a.click();

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const form = new FormData();
      form.set("date", date);
      form.set("file", new File([blob], `big-dog-board-${date}.png`, { type: "image/png" }));
      const response = await fetch("/api/teacher/board", { method: "POST", body: form });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) flashToast(`Exported - couldn't save to lesson: ${result.error || "Upload failed."}`);
      else flashToast("Saved to today's lesson");
    } catch {
      flashToast("Exported. (Couldn't reach the lesson to save.)");
    }
  }

  useEffect(() => {
    try {
      const r = new URLSearchParams(window.location.search).get("room");
      if (r) setRoom(r.trim());
    } catch { /* ignore */ }
  }, []);

  // Keep the iPad awake through a whole lesson; re-acquire when the tab
  // returns to the foreground (Safari releases the lock in the background).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
        if (!wl || stopped || document.visibilityState !== "visible") return;
        lock = await wl.request("screen");
      } catch { /* not supported or denied - the iPad just sleeps as before */ }
    };
    void acquire();
    const onVisible = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // Control channel: scratch overlay open/close and page flips. A display
  // that joins (or reconnects) says hello; answer with where we are.
  useEffect(() => {
    const ctrl = joinInkRoom(`${room}__ctrl`, (m) => {
      if (m.t === "scratch") setScratchOpen(m.open);
      else if (m.t === "hello") {
        ctrl.send({ t: "pageflip", index: activePageRef.current, count: pageCountRef.current });
        if (scratchOpenRef.current) ctrl.send({ t: "scratch", open: true });
      }
    });
    ctrlRef.current = ctrl;
    return () => ctrl.close();
  }, [room]);

  // Tell the displays which page is up whenever it changes.
  useEffect(() => {
    ctrlRef.current?.send({ t: "pageflip", index: activePage, count: pages.length });
  }, [activePage, pages.length]);

  // The projector overlay announces its aspect ratio; letterbox to match so
  // strokes land on the wall exactly where the pen put them.
  useEffect(() => {
    if (surface !== "screen") return;
    const view = joinInkRoom(`${room}__over`, (m) => {
      if (m.t === "view" && Number.isFinite(m.ar) && m.ar > 0.5 && m.ar < 4) setScreenAr(m.ar);
    });
    return () => view.close();
  }, [room, surface]);

  function toggleScratch() {
    setScratchOpen((v) => {
      const next = !v;
      ctrlRef.current?.send({ t: "scratch", open: next });
      return next;
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const target = activePage;
    const reader = new FileReader();
    reader.onload = () => patchPage(target, { bg: typeof reader.result === "string" ? reader.result : null });
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    } catch { /* ignore */ }
  }

  const onBoard = surface === "board";

  return (
    <main className="ip-page">
      <style>{`
        .ip-page { position:fixed; inset:0; display:flex; flex-direction:column; background:var(--bdb-ground); font-family:var(--bdb-font); }
        .ip-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-group { display:flex; align-items:center; gap:6px; }
        .ip-room { font-weight:800; color:var(--bdb-ink); font-size:0.92rem; margin-right:2px; }
        .ip-sub { color:var(--bdb-ink-faint); font-size:0.72rem; font-weight:700; }
        .ip-status { display:inline-flex; align-items:center; gap:6px; border-radius:999px; background:#eef2f0; color:#756d62; padding:6px 9px; font-size:0.7rem; font-weight:850; }
        .ip-status::before { content:""; width:7px; height:7px; border-radius:50%; background:#c78b24; }
        .ip-status.connected { background:#e8f5ed; color:#255e41; }
        .ip-status.connected::before { background:#2f9e6f; }
        .ip-status.disconnected { background:#fff0e8; color:#8b3f24; }
        .ip-status.disconnected::before { background:#d05f3c; }
        .ip-seg { display:inline-flex; border:2px solid var(--bdb-line); border-radius:12px; overflow:hidden; background:var(--bdb-card); }
        .ip-seg button { font:inherit; font-weight:800; font-size:0.86rem; min-height:42px; padding:0 14px; border:none; background:transparent; color:var(--bdb-ink-soft); cursor:pointer; touch-action:manipulation; }
        .ip-seg button.on { background:var(--bdb-ink); color:#fff; }
        .ip-sw { width:30px; height:30px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 0 1px var(--bdb-line); cursor:pointer; padding:0; }
        .ip-sw.on { box-shadow:0 0 0 3px var(--bdb-ink); }
        .ip-btn { min-height:42px; padding:0 14px; border-radius:10px; border:1px solid var(--bdb-line); background:var(--bdb-card); color:var(--bdb-ink); font-weight:700; font-size:0.9rem; cursor:pointer; touch-action:manipulation; }
        .ip-btn.on { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .ip-btn.warn { color:var(--bdb-coral); border-color:color-mix(in srgb, var(--bdb-coral) 40%, var(--bdb-line)); }
        .ip-divider { width:1px; align-self:stretch; background:var(--bdb-line); margin:2px 4px; }
        .ip-problem { display:flex; gap:10px; align-items:center; padding:8px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-problem-in { flex:1; resize:vertical; min-height:42px; border:1px solid var(--bdb-line); border-radius:10px; padding:10px 12px; font-family:var(--bdb-font); font-size:0.95rem; color:var(--bdb-ink); }
        .ip-templates { display:flex; gap:8px; flex-wrap:wrap; padding:8px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-stage { position:relative; flex:1; }
        .ip-screen-stage { position:absolute; inset:0; display:grid; place-items:center; background:#26221c; }
        .ip-screen-box { position:relative; width:100%; max-height:100%; }
        .ip-screen-frame { position:absolute; inset:0; width:100%; height:100%; border:0; pointer-events:none; background:#fff; }
        .ip-screen-note { position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:6; background:rgba(32,30,26,0.78); color:#fff; font-size:0.72rem; font-weight:800; padding:5px 12px; border-radius:999px; pointer-events:none; }
        .ip-scratch { position:absolute; inset:0; z-index:5; display:flex; flex-direction:column; background:#fff; }
        .ip-scratch-bar { display:flex; align-items:center; gap:8px; padding:8px 14px; background:var(--bdb-card); border-bottom:1px solid var(--bdb-line); }
        .ip-scratch-title { font-weight:800; color:var(--bdb-ink); }
        .ip-scratch-stage { position:relative; flex:1; }
        .ip-spacer { flex:1; }
      `}</style>

      <div className="ip-bar">
        <span className="ip-room">iPad</span>
        <span className="ip-sub">room {room}</span>
        <span className={`ip-status ${boardStatus}`} role="status">
          {boardStatus === "connected" ? "Connected" : boardStatus === "disconnected" ? "Reconnecting" : "Connecting"}
        </span>
        <div className="ip-seg" role="group" aria-label="Writing surface">
          <button className={onBoard ? "on" : ""} onClick={() => switchSurface("board")}>Board</button>
          <button className={!onBoard ? "on" : ""} onClick={() => switchSurface("screen")}>Write on screen</button>
        </div>
        {onBoard && (
          <div className="ip-group" role="group" aria-label="Pages">
            {pages.map((_, i) => (
              <button key={i} className={`ip-btn${i === activePage ? " on" : ""}`} onClick={() => flipTo(i)}>{i + 1}</button>
            ))}
            {pages.length < MAX_PAGES && (
              <button className="ip-btn" aria-label="Add page" onClick={addPage}>+</button>
            )}
          </div>
        )}
        <span className="ip-divider" />

        <div className="ip-group" role="group" aria-label="Colors">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`ip-sw${tool !== "erase" && tool !== "pixel" && tool !== "laser" && color === c ? " on" : ""}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              onClick={() => { setColor(c); if (tool === "erase" || tool === "pixel" || tool === "laser") setTool("pen"); }}
            />
          ))}
        </div>
        <span className="ip-divider" />

        <button className={`ip-btn${tool === "pen" ? " on" : ""}`} onClick={() => setTool("pen")}>Pen</button>
        <button className={`ip-btn${tool === "hl" ? " on" : ""}`} onClick={() => setTool("hl")}>Highlight</button>
        <button className={`ip-btn${tool === "laser" ? " on" : ""}`} onClick={() => setTool("laser")}>Laser</button>
        <button className={`ip-btn${tool === "erase" ? " on" : ""}`} onClick={() => setTool("erase")}>Eraser</button>
        <button className={`ip-btn${tool === "pixel" ? " on" : ""}`} onClick={() => setTool("pixel")}>Pixel</button>
        <span className="ip-divider" />
        <button className="ip-btn" disabled={!history.undo} style={!history.undo ? { opacity: 0.4 } : undefined} onClick={() => { if (onBoard) bumpPage("undo"); else setUndoSignal((n) => n + 1); }}>Undo</button>
        <button className="ip-btn" disabled={!history.redo} style={!history.redo ? { opacity: 0.4 } : undefined} onClick={() => { if (onBoard) bumpPage("redo"); else setRedoSignal((n) => n + 1); }}>Redo</button>

        <div className="ip-group" role="group" aria-label="Width">
          {WIDTHS.map((w) => (
            <button key={w.px} className={`ip-btn${penWidth === w.px ? " on" : ""}`} onClick={() => setPenWidth(w.px)}>{w.label}</button>
          ))}
        </div>
        <span className="ip-divider" />

        {onBoard && (
          <>
            <button className={`ip-btn${showProblem ? " on" : ""}`} onClick={() => setShowProblem((v) => !v)}>Problem</button>
            <button className={`ip-btn${showTemplates ? " on" : ""}`} onClick={() => setShowTemplates((v) => !v)}>Templates</button>
            <button className="ip-btn" onClick={() => fileRef.current?.click()}>Background</button>
            {page.bg && <button className="ip-btn warn" onClick={() => patchPage(activePage, { bg: null })}>Remove bg</button>}
            <button className={`ip-btn${scratchOpen ? " on" : ""}`} onClick={toggleScratch}>Scratch</button>
            <button className="ip-btn warn" onClick={() => bumpPage("clear")}>Clear</button>
          </>
        )}
        {!onBoard && (
          <button className="ip-btn warn" onClick={() => setScreenClearSignal((n) => n + 1)}>Clear ink</button>
        )}

        <span className="ip-spacer" />
        <button className={`ip-btn${fingerDraws ? " on" : ""}`} onClick={() => setFingerDraws((v) => !v)}>Finger draws</button>
        {onBoard && <button className="ip-btn" onClick={() => bumpPage("exportSig")}>Export</button>}
        <button className="ip-btn" onClick={toggleFullscreen}>Full screen</button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: "none" }} />
      </div>

      {onBoard && showProblem && (
        <div className="ip-problem">
          <textarea
            className="ip-problem-in"
            placeholder="One problem per line - they show on the board with space to solve."
            value={page.problem ?? ""}
            onChange={(e) => patchPage(activePage, { problem: e.target.value ? e.target.value : null })}
            rows={2}
          />
          <button className="ip-btn warn" onClick={() => patchPage(activePage, { problem: null })}>Clear problem</button>
        </div>
      )}

      {onBoard && showTemplates && (
        <div className="ip-templates">
          {BOARD_TEMPLATES.map((t) => (
            <button key={t.id} className="ip-btn" onClick={() => { patchPage(activePage, { bg: t.build() }); setShowTemplates(false); }}>{t.label}</button>
          ))}
        </div>
      )}

      <div className="ip-stage">
        {/* Every page stays mounted (hidden pages park at 1x1 canvases) so
            strokes, history, and sync survive page flips AND surface
            switches - toggling to Write on screen no longer discards the
            iPad's copy of the board. */}
        {pages.map((p, i) => (
          <InkBoard
            key={i}
            room={i === 0 ? room : `${room}__p${i}`}
            interactive
            hidden={!onBoard || i !== activePage}
            allowZoom
            paper="dots"
            color={color}
            tool={tool}
            penWidth={penWidth}
            fingerDraws={fingerDraws}
            background={p.bg}
            problem={p.problem}
            clearSignal={p.clear}
            undoSignal={p.undo}
            redoSignal={p.redo}
            exportSignal={p.exportSig}
            onExport={handleExport}
            onHistoryChange={(undo, redo) => {
              historiesRef.current[i] = { undo, redo };
              if (surfaceRef.current === "board" && i === activePageRef.current) setHistory({ undo, redo });
            }}
            onConnectionChange={i === 0 ? setBoardStatus : undefined}
          />
        ))}
        {onBoard && scratchOpen && (
          <div className="ip-scratch">
            <div className="ip-scratch-bar">
              <span className="ip-scratch-title">Scratch</span>
              <span className="ip-spacer" />
              <button className="ip-btn" onClick={() => setScratchUndoSignal((n) => n + 1)}>Undo</button>
              <button className="ip-btn warn" onClick={() => setScratchClear((n) => n + 1)}>Clear</button>
              <button className="ip-btn" onClick={toggleScratch}>Done</button>
            </div>
            <div className="ip-scratch-stage">
              <InkBoard
                room={`${room}__scratch`}
                interactive
                color={color}
                tool={tool}
                penWidth={penWidth}
                fingerDraws={fingerDraws}
                clearSignal={scratchClear}
                undoSignal={scratchUndoSignal}
              />
            </div>
          </div>
        )}
        <div className="ip-screen-stage" style={onBoard ? { display: "none" } : undefined}>
          <div className="ip-screen-box" style={{ aspectRatio: String(screenAr) }}>
            {!onBoard && (
              <iframe
                className="ip-screen-frame"
                src={`/teacher/present?embed=1${room !== "main" ? `&room=${encodeURIComponent(room)}` : ""}`}
                title="Live class screen"
              />
            )}
            <InkBoard
              room={`${room}__over`}
              interactive
              transparent
              hidden={onBoard}
              color={color}
              tool={tool}
              penWidth={penWidth}
              fingerDraws={fingerDraws}
              clearSignal={screenClearSignal}
              undoSignal={undoSignal}
              redoSignal={redoSignal}
              onHistoryChange={(undo, redo) => {
                screenHistoryRef.current = { undo, redo };
                if (surfaceRef.current === "screen") setHistory({ undo, redo });
              }}
            />
            <span className="ip-screen-note">Writing over the class screen</span>
          </div>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", left: "50%", bottom: 18, transform: "translateX(-50%)", zIndex: 50,
            background: "#201e1a", color: "#fff", padding: "11px 18px", borderRadius: 12,
            fontFamily: "var(--bdb-font)", fontWeight: 700, fontSize: "0.92rem",
            boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
          }}
        >
          {toast}
        </div>
      )}
    </main>
  );
}
