"use client";

// Shared ink surface for the iPad pen and the board display.
//
// The engine renders strokes as FILLED VARIABLE-WIDTH POLYGONS (see
// lib/inkGeometry) instead of stroked polylines: width flows continuously with
// smoothed Pencil pressure and both ends taper, which is most of what makes
// notes-app ink look like ink. Three stacked canvases:
//
//   highlight  - dry highlighter strokes (translucent, under the ink)
//   dry        - finished pen strokes, baked once
//   wet        - the stroke(s) currently in flight, redrawn per frame, plus
//                the Pencil's PREDICTED points (drawn, never persisted) to
//                claw back perceived latency, plus the eraser ring
//
// Latency details that matter: coalesced events (240Hz Pencil samples),
// predicted events, desynchronized canvases where supported, and the surface
// rect cached per stroke instead of a layout read on every move event.
//
// Strokes travel as normalised 0..1 coords (see inkSync.ts) so the iPad and
// the board can be different sizes and still match. Pressure is smoothed at
// the CAPTURE side so every surface renders identical shapes.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  joinInkRoom,
  type InkChannel,
  type InkConnectionStatus,
  type InkMessage,
  type InkPoint,
  type InkStroke,
} from "@/lib/inkSync";
import { fillDot, fillOutline, fitSnapShape, highlightOutline, snapLinePoints, strokeOutline, type InkRenderPoint } from "@/lib/inkGeometry";

// erase = STROKE eraser (touch a stroke, the whole stroke vanishes - the one
// you want mid-lesson); pixel = the classic rub-out; laser = a fading pointer
// trail the room sees but nothing keeps.
export type InkTool = "pen" | "hl" | "erase" | "pixel" | "laser";

const HL_ALPHA = 0.36;
const ERASE_SCALE = 5; // pixel eraser is 5x the dialled pen width, as before
const HL_SCALE = 3; // highlighter band is 3x the dialled pen width
const LASER_MS = 850; // how long the laser trail lingers
const HOLD_SNAP_MS = 600; // hold the pen still this long to straighten the stroke
const HOLD_SNAP_RADIUS = 8; // "still" = within this many px

// One entry per user action, so undo restores exactly what the action did:
// un-drawing a stroke, or bringing back everything one eraser swipe removed.
type InkOp = { kind: "draw"; stroke: InkStroke } | { kind: "erase"; strokes: InkStroke[] };

interface InkBoardProps {
  room: string;
  interactive: boolean; // the pen surface draws; the board display does not
  color?: string;
  tool?: InkTool;
  penWidth?: number; // px on this surface
  fingerDraws?: boolean; // default false: only pen + mouse draw; touch never marks
  background?: string | null; // data URL, controlled by the pen page
  problem?: string | null; // problem(s) to show with space to solve
  transparent?: boolean; // no white ground - used for the over-screen glass sheet
  passThrough?: boolean; // display overlay: never intercept pointer events
  announceView?: boolean; // display side: broadcast this surface's aspect ratio
  clearSignal?: number; // bump to clear
  undoSignal?: number; // bump to undo the last action
  redoSignal?: number; // bump to redo
  exportSignal?: number; // bump to export the board as a PNG
  onExport?: (dataUrl: string) => void; // receives the flattened PNG; if absent, downloads
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onConnectionChange?: (status: InkConnectionStatus) => void;
}

interface ActiveStroke {
  stroke: InkStroke;
  px: InkRenderPoint[]; // stroke.points converted to surface pixels
  lastErase: { x: number; y: number } | null;
}

function pressureOf(p?: number): number {
  return p && p > 0 && p <= 1 ? p : 0.5;
}

export default function InkBoard({
  room,
  interactive,
  color = "#111827",
  tool = "pen",
  penWidth = 5,
  fingerDraws = false,
  background = null,
  problem = null,
  transparent = false,
  passThrough = false,
  announceView = false,
  clearSignal = 0,
  undoSignal = 0,
  redoSignal = 0,
  exportSignal = 0,
  onExport,
  onHistoryChange,
  onConnectionChange,
}: InkBoardProps) {
  const hlRef = useRef<HTMLCanvasElement | null>(null);
  const dryRef = useRef<HTMLCanvasElement | null>(null);
  const wetRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [problemText, setProblemText] = useState<string | null>(null);

  const channelRef = useRef<InkChannel | null>(null);
  const strokesRef = useRef<InkStroke[]>([]);
  const byIdRef = useRef<Map<string, InkStroke>>(new Map());
  const activeRef = useRef<Map<string, ActiveStroke>>(new Map());
  const drawingRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const rectRef = useRef({ left: 0, top: 0, width: 1, height: 1 });
  const predictedRef = useRef<InkRenderPoint[]>([]);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const emaRef = useRef(0.5);
  const lastMoveRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const frameRef = useRef<number | null>(null);

  // Phase 2 state: history, stroke-eraser gesture, shape snap, laser, taps.
  const historyRef = useRef<InkOp[]>([]);
  const redoRef = useRef<InkOp[]>([]);
  const eraseSweepRef = useRef<InkStroke[]>([]); // strokes removed by the current eraser drag
  const snapRef = useRef<{ anchor: InkRenderPoint; kind: "line" } | null>(null); // after a snap, moves adjust the line's far end
  const snapTimerRef = useRef<number | null>(null);
  const holdAnchorRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const laserRef = useRef<Map<string, { pts: { x: number; y: number; t: number }[] }>>(new Map());
  const laserIdRef = useRef<string | null>(null);
  const touchTapsRef = useRef<Map<number, { x: number; y: number; t: number; moved: boolean; up: boolean }>>(new Map());
  const lastStatusRef = useRef<InkConnectionStatus>("connecting");

  // Latest tool settings, read inside pointer handlers.
  const colorRef = useRef(color);
  const toolRef = useRef<InkTool>(tool);
  const widthRef = useRef(penWidth);
  const fingerRef = useRef(fingerDraws);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { widthRef.current = penWidth; }, [penWidth]);
  useEffect(() => { fingerRef.current = fingerDraws; }, [fingerDraws]);

  // Only the wet layer gets a desynchronized (low-latency) context: it is
  // never read back. The dry layers feed Export via drawImage, and
  // desynchronized canvases can return blank on readback on some platforms.
  const ctxOf = useCallback((c: HTMLCanvasElement | null) => {
    if (!c) return null;
    if (c === wetRef.current) return c.getContext("2d", { desynchronized: true }) ?? c.getContext("2d");
    return c.getContext("2d");
  }, []);

  const size = useCallback(() => {
    const r = rectRef.current;
    return { w: r.width || 1, h: r.height || 1 };
  }, []);

  const measure = useCallback(() => {
    const c = wetRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    // A hidden or not-yet-laid-out surface measures 0x0; keep the last good
    // geometry instead of poisoning every coordinate that follows.
    if (r.width < 2 || r.height < 2) return;
    rectRef.current = { left: r.left, top: r.top, width: r.width, height: r.height };
  }, []);

  // ── Painting ───────────────────────────────────────────────────────────────

  const toPx = useCallback((p: InkPoint): InkRenderPoint => {
    const { w, h } = size();
    return { x: p.x * w, y: p.y * h, p: pressureOf(p.p) };
  }, [size]);

  const paintStroke = useCallback((ctx: CanvasRenderingContext2D, s: InkStroke, px: InkRenderPoint[]) => {
    if (!px.length) return;
    const { w } = size();
    const baseW = Math.max(1, s.widthFrac * w);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = s.color;
    ctx.globalAlpha = s.m === "h" ? HL_ALPHA : 1;
    const ring = s.m === "h" ? highlightOutline(px, baseW) : strokeOutline(px, baseW);
    if (ring) fillOutline(ctx, ring);
    else fillDot(ctx, px[0], baseW);
    ctx.globalAlpha = 1;
  }, [size]);

  // Pixel-erase applies immediately to both dry layers as segments arrive.
  const paintEraseSegment = useCallback((s: InkStroke, from: { x: number; y: number } | null, px: InkRenderPoint[]) => {
    if (!px.length) return;
    const { w } = size();
    const lw = Math.max(4, s.widthFrac * w);
    for (const c of [hlRef.current, dryRef.current]) {
      const ctx = ctxOf(c);
      if (!ctx) continue;
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = lw;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      let prev = from;
      for (const p of px) {
        if (prev) { ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); }
        else { ctx.moveTo(p.x - 0.01, p.y); ctx.lineTo(p.x, p.y); }
        prev = { x: p.x, y: p.y };
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
    }
  }, [ctxOf, size]);

  const bake = useCallback((s: InkStroke) => {
    if (s.erase) return; // erase already applied as it streamed
    const px = s.points.map(toPx);
    const ctx = ctxOf(s.m === "h" ? hlRef.current : dryRef.current);
    if (ctx) paintStroke(ctx, s, px);
  }, [ctxOf, paintStroke, toPx]);

  // The wet layer: every in-flight stroke + local prediction + the eraser ring.
  const paintWet = useCallback(() => {
    const ctx = ctxOf(wetRef.current);
    if (!ctx) return;
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    for (const [id, a] of activeRef.current) {
      if (a.stroke.erase) continue;
      const px = id === activeIdRef.current && predictedRef.current.length
        ? [...a.px, ...predictedRef.current]
        : a.px;
      paintStroke(ctx, a.stroke, px);
    }
    const hover = hoverRef.current;
    const t = toolRef.current;
    if (hover && interactive && (t === "erase" || t === "pixel") && !drawingRef.current) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(32,30,26,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const ringR = t === "pixel" ? (widthRef.current * ERASE_SCALE) / 2 : Math.max(9, widthRef.current * 1.6);
      ctx.arc(hover.x, hover.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Laser trails: a glowing coral streak that fades out on its own. Points
    // older than LASER_MS are pruned; while any remain the wet layer keeps
    // repainting itself so the fade is smooth on every surface.
    const now = performance.now();
    let laserAlive = false;
    for (const [id, trail] of laserRef.current) {
      trail.pts = trail.pts.filter((p) => now - p.t < LASER_MS);
      if (trail.pts.length < 1) { laserRef.current.delete(id); continue; }
      laserAlive = true;
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < trail.pts.length; i += 1) {
        const a = trail.pts[i - 1], b = trail.pts[i];
        const age = now - b.t;
        const alpha = Math.max(0, 1 - age / LASER_MS);
        ctx.shadowColor = "rgba(249,83,53,0.9)";
        ctx.shadowBlur = 14 * alpha;
        ctx.strokeStyle = `rgba(249,83,53,${0.8 * alpha})`;
        ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255,244,238,${0.9 * alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      const head = trail.pts[trail.pts.length - 1];
      const headAge = now - head.t;
      const headAlpha = Math.max(0, 1 - headAge / LASER_MS);
      ctx.fillStyle = `rgba(255,255,255,${0.95 * headAlpha})`;
      ctx.shadowColor = "rgba(249,83,53,0.95)";
      ctx.shadowBlur = 18 * headAlpha;
      ctx.beginPath(); ctx.arc(head.x, head.y, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (laserAlive) scheduleWetRef.current?.();
  }, [ctxOf, interactive, paintStroke, size]);

  // paintWet needs to re-arm itself while laser trails fade; the scheduler is
  // defined just below, so it reaches it through a ref.
  const scheduleWetRef = useRef<(() => void) | null>(null);

  const scheduleWet = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      paintWet();
    });
  }, [paintWet]);
  useEffect(() => { scheduleWetRef.current = scheduleWet; }, [scheduleWet]);

  const redrawAll = useCallback(() => {
    const { w, h } = size();
    for (const c of [hlRef.current, dryRef.current, wetRef.current]) ctxOf(c)?.clearRect(0, 0, w, h);
    for (const s of strokesRef.current) {
      if (s.erase) paintEraseSegment(s, null, s.points.map(toPx));
      else bake(s);
    }
    for (const a of activeRef.current.values()) {
      a.px = a.stroke.points.map(toPx);
      a.lastErase = null;
    }
    paintWet();
  }, [bake, ctxOf, paintEraseSegment, paintWet, size, toPx]);

  const announce = useCallback(() => {
    const r = rectRef.current;
    if (r.height > 0) channelRef.current?.send({ t: "view", ar: r.width / r.height });
  }, []);

  // ── History + shared mutations (undo/redo, stroke eraser, snap) ────────────

  const notifyHistory = useCallback(() => {
    onHistoryChange?.(historyRef.current.length > 0, redoRef.current.length > 0);
  }, [onHistoryChange]);

  const redrawDirtyRef = useRef(false);
  const scheduleRedraw = useCallback(() => {
    if (redrawDirtyRef.current) return;
    redrawDirtyRef.current = true;
    window.requestAnimationFrame(() => {
      redrawDirtyRef.current = false;
      redrawAll();
    });
  }, [redrawAll]);

  const removeStrokes = useCallback((ids: string[], broadcast: boolean): InkStroke[] => {
    const idSet = new Set(ids);
    const removed: InkStroke[] = [];
    strokesRef.current = strokesRef.current.filter((s) => {
      if (idSet.has(s.id)) { removed.push(s); return false; }
      return true;
    });
    for (const id of idSet) { byIdRef.current.delete(id); activeRef.current.delete(id); }
    if (removed.length) {
      scheduleRedraw();
      if (broadcast) channelRef.current?.send({ t: "remove", ids: removed.map((s) => s.id) });
    }
    return removed;
  }, [scheduleRedraw]);

  const restoreStroke = useCallback((stroke: InkStroke, broadcast: boolean) => {
    if (byIdRef.current.has(stroke.id)) return;
    byIdRef.current.set(stroke.id, stroke);
    strokesRef.current.push(stroke);
    scheduleRedraw();
    if (broadcast) channelRef.current?.send({ t: "restore", stroke });
  }, [scheduleRedraw]);

  // Undo inverts the op and moves it to the redo stack; redo re-applies it and
  // moves it back. "draw" holds the stroke object itself so restoring is exact.
  const performUndo = useCallback(() => {
    const op = historyRef.current.pop();
    if (!op) return;
    if (op.kind === "draw") removeStrokes([op.stroke.id], true);
    else for (const s of op.strokes) restoreStroke(s, true);
    redoRef.current.push(op);
    notifyHistory();
  }, [notifyHistory, removeStrokes, restoreStroke]);

  const performRedo = useCallback(() => {
    const op = redoRef.current.pop();
    if (!op) return;
    if (op.kind === "draw") restoreStroke(op.stroke, true);
    else removeStrokes(op.strokes.map((s) => s.id), true);
    historyRef.current.push(op);
    notifyHistory();
  }, [notifyHistory, removeStrokes, restoreStroke]);

  const recordOp = useCallback((op: InkOp) => {
    historyRef.current.push(op);
    if (historyRef.current.length > 200) historyRef.current.shift();
    redoRef.current = []; // a new action forks history - the redo branch dies
    notifyHistory();
  }, [notifyHistory]);

  const resize = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    for (const c of [hlRef.current, dryRef.current, wetRef.current]) {
      if (!c) continue;
      c.width = Math.max(1, Math.floor(r.width * dpr));
      c.height = Math.max(1, Math.floor(r.height * dpr));
      const ctx = ctxOf(c);
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    measure();
    redrawAll();
    if (announceView) announce();
  }, [announce, announceView, ctxOf, measure, redrawAll]);

  const clearLocal = useCallback(() => {
    strokesRef.current = [];
    byIdRef.current.clear();
    activeRef.current.clear();
    predictedRef.current = [];
    laserRef.current.clear();
    eraseSweepRef.current = [];
    // Clear is deliberate and destructive - history does not survive it.
    historyRef.current = [];
    redoRef.current = [];
    onHistoryChange?.(false, false);
    const { w, h } = size();
    for (const c of [hlRef.current, dryRef.current, wetRef.current]) ctxOf(c)?.clearRect(0, 0, w, h);
  }, [ctxOf, onHistoryChange, size]);

  // Apply one incoming/local segment.
  const applySeg = useCallback((seg: Extract<InkMessage, { t: "seg" }>) => {
    let stroke = byIdRef.current.get(seg.id);
    if (!stroke || seg.start) {
      stroke = { id: seg.id, color: seg.color, erase: seg.erase, m: seg.m, widthFrac: seg.widthFrac, points: [] };
      byIdRef.current.set(seg.id, stroke);
      strokesRef.current.push(stroke);
      activeRef.current.set(seg.id, { stroke, px: [], lastErase: null });
    }
    const active = activeRef.current.get(seg.id);
    const incoming = seg.pts.map(toPx);
    stroke.points.push(...seg.pts);
    if (active) {
      if (stroke.erase) {
        paintEraseSegment(stroke, active.lastErase, incoming);
        if (incoming.length) {
          const last = incoming[incoming.length - 1];
          active.lastErase = { x: last.x, y: last.y };
        }
      } else {
        active.px.push(...incoming);
        scheduleWet();
      }
    }
    if (seg.end) {
      activeRef.current.delete(seg.id);
      if (!stroke.erase) {
        bake(stroke);
        scheduleWet();
      }
    }
  }, [bake, paintEraseSegment, scheduleWet, toPx]);

  // ── Channel ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = joinInkRoom(room, (m) => {
      if (m.t === "seg") applySeg(m);
      else if (m.t === "clear") clearLocal();
      else if (m.t === "bg") setBgUrl(m.url);
      else if (m.t === "problem") setProblemText(m.text);
      else if (m.t === "remove") removeStrokes(m.ids, false);
      else if (m.t === "restore") restoreStroke(m.stroke, false);
      else if (m.t === "replace") {
        const existing = byIdRef.current.get(m.stroke.id);
        if (existing) existing.points = m.stroke.points;
        else { byIdRef.current.set(m.stroke.id, m.stroke); strokesRef.current.push(m.stroke); }
        activeRef.current.delete(m.stroke.id);
        scheduleRedraw();
      } else if (m.t === "laser") {
        const now = performance.now();
        let trail = laserRef.current.get(m.id);
        if (!trail) { trail = { pts: [] }; laserRef.current.set(m.id, trail); }
        const { w, h } = size();
        for (const p of m.pts) trail.pts.push({ x: p.x * w, y: p.y * h, t: now });
        scheduleWet();
      } else if (m.t === "hello") {
        if (interactive) {
          channel.send({ t: "state", strokes: strokesRef.current, bg: bgUrlRef.current, problem: problemRef.current });
        }
        if (announceView) announce();
      } else if (m.t === "state" && !interactive) {
        clearLocal();
        for (const s of m.strokes) {
          byIdRef.current.set(s.id, s);
          strokesRef.current.push(s);
        }
        setBgUrl(m.bg);
        setProblemText(m.problem);
        redrawAll();
      }
    }, (status) => {
      // A display that drops and comes back re-asks for the whole board, so a
      // wifi blip mid-lesson can never leave the wall missing strokes.
      if (!interactive && status === "connected" && lastStatusRef.current === "disconnected") {
        channel.send({ t: "hello" });
      }
      lastStatusRef.current = status;
      onConnectionChange?.(status);
    });
    channelRef.current = channel;
    if (!interactive) channel.send({ t: "hello" }); // ask the pen for current state
    if (announceView) announce();
    return () => channel.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, interactive]);

  const bgUrlRef = useRef<string | null>(null);
  useEffect(() => { bgUrlRef.current = bgUrl; }, [bgUrl]);
  const problemRef = useRef<string | null>(null);
  useEffect(() => { problemRef.current = problemText; }, [problemText]);

  const displayedProblem = problemText?.trim() ? problemText : problem;

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    const el = wrapRef.current;
    const ro = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(() => resize()) : null;
    if (el && ro) ro.observe(el);
    // A surface opened in a BACKGROUND tab can lay out late with no resize
    // event ever firing, leaving 1x1 canvases that silently paint nothing
    // (the projector tab opened behind /control, for example). Retry until
    // the wrapper has real size, then stop.
    const tick = window.setInterval(() => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (r && r.width > 1 && rectRef.current.width <= 1) resize();
      if (rectRef.current.width > 1) window.clearInterval(tick);
    }, 350);
    return () => {
      window.removeEventListener("resize", resize);
      ro?.disconnect();
      window.clearInterval(tick);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [resize]);

  // Pen page controls the background; broadcast it.
  useEffect(() => {
    if (!interactive) return;
    setBgUrl(background);
    channelRef.current?.send({ t: "bg", url: background });
  }, [background, interactive]);

  // Pen page controls the problem(s); broadcast them.
  useEffect(() => {
    if (!interactive) return;
    setProblemText(problem);
    channelRef.current?.send({ t: "problem", text: problem });
  }, [problem, interactive]);

  useEffect(() => { notifyHistory(); }, [notifyHistory]);

  // Undo / redo signals from the toolbar.
  const lastUndoRef = useRef(undoSignal);
  useEffect(() => {
    if (undoSignal === lastUndoRef.current) return;
    lastUndoRef.current = undoSignal;
    if (undoSignal !== 0) performUndo();
  }, [undoSignal, performUndo]);
  const lastRedoRef = useRef(redoSignal);
  useEffect(() => {
    if (redoSignal === lastRedoRef.current) return;
    lastRedoRef.current = redoSignal;
    if (redoSignal !== 0) performRedo();
  }, [redoSignal, performRedo]);

  // Clear signal from the toolbar.
  const lastClearRef = useRef(clearSignal);
  useEffect(() => {
    if (clearSignal === lastClearRef.current) return;
    lastClearRef.current = clearSignal;
    if (clearSignal === 0) return;
    clearLocal();
    channelRef.current?.send({ t: "clear" });
  }, [clearSignal, clearLocal]);

  // Flatten everything (white + background + problems + highlighter + ink) to a PNG.
  const buildExportCanvas = useCallback((): HTMLCanvasElement | null => {
    const dry = dryRef.current, hl = hlRef.current;
    if (!dry || !hl) return null;
    const rect = rectRef.current;
    const W = rect.width, H = rect.height, scale = 2;
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.floor(W * scale));
    out.height = Math.max(1, Math.floor(H * scale));
    const o = out.getContext("2d");
    if (!o) return null;
    o.scale(scale, scale);
    o.fillStyle = "#ffffff";
    o.fillRect(0, 0, W, H);

    const img = bgImgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      const r = Math.min(W / img.naturalWidth, H / img.naturalHeight);
      const iw = img.naturalWidth * r, ih = img.naturalHeight * r;
      o.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
    }

    const text = problemRef.current;
    if (text && text.trim()) {
      const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(v, hi));
      const pad = clamp(18, 0.035 * W, 44);
      const gap = clamp(22, 0.07 * H, 80);
      const fontPx = clamp(20, 0.027 * W, 33.6);
      const cardPadX = 22, cardPadY = 12, lineH = fontPx * 1.25, maxCardW = 0.74 * W;
      o.textBaseline = "top";
      o.font = `700 ${fontPx}px "Albert Sans", system-ui, sans-serif`;
      let y = pad;
      for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
        const maxTextW = maxCardW - 2 * cardPadX;
        const words = line.split(/\s+/);
        const wrapped: string[] = [];
        let cur = "";
        for (const w of words) {
          const t = cur ? `${cur} ${w}` : w;
          if (o.measureText(t).width > maxTextW && cur) { wrapped.push(cur); cur = w; }
          else cur = t;
        }
        if (cur) wrapped.push(cur);
        const textW = Math.min(maxTextW, Math.max(...wrapped.map((t) => o.measureText(t).width)));
        const cardW = textW + 2 * cardPadX, cardH = wrapped.length * lineH + 2 * cardPadY;
        o.fillStyle = "#fbf7ef";
        o.strokeStyle = "#ece4d4";
        o.lineWidth = 1;
        o.beginPath();
        if (o.roundRect) o.roundRect(pad, y, cardW, cardH, 14);
        else o.rect(pad, y, cardW, cardH);
        o.fill();
        o.stroke();
        o.fillStyle = "#201e1a";
        wrapped.forEach((t, i) => o.fillText(t, pad + cardPadX, y + cardPadY + i * lineH));
        y += cardH + gap;
      }
    }

    o.drawImage(hl, 0, 0, W, H);
    o.drawImage(dry, 0, 0, W, H);
    return out;
  }, []);

  const lastExportRef = useRef(exportSignal);
  useEffect(() => {
    if (exportSignal === lastExportRef.current) return;
    lastExportRef.current = exportSignal;
    if (exportSignal === 0) return;
    const out = buildExportCanvas();
    if (!out) return;
    const dataUrl = out.toDataURL("image/png");
    if (onExport) { onExport(dataUrl); return; }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `big-dog-board-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }, [exportSignal, buildExportCanvas, onExport]);

  // ── Pointer drawing (pen surface only) ──────────────────────────────────────

  // Smoothed pressure at the capture side; mouse and finger get a light
  // velocity-based synthesis so strokes still breathe without a Pencil.
  const smoothedPressure = useCallback((e: PointerEvent, x: number, y: number): number => {
    let raw: number;
    if (e.pointerType === "pen" && e.pressure > 0) {
      raw = e.pressure;
    } else {
      const last = lastMoveRef.current;
      const now = performance.now();
      if (last) {
        const dt = Math.max(1, now - last.t);
        const v = Math.hypot(x - last.x, y - last.y) / dt; // px per ms
        raw = Math.max(0.3, Math.min(0.75, 0.62 - v * 0.09));
      } else raw = 0.55;
      lastMoveRef.current = { x, y, t: now };
    }
    emaRef.current = emaRef.current + 0.45 * (raw - emaRef.current);
    return Math.round(emaRef.current * 100) / 100;
  }, []);

  const toNorm = useCallback((clientX: number, clientY: number, p: number): InkPoint => {
    const r = rectRef.current;
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height, p };
  }, []);

  const queuedSegmentRef = useRef<Extract<InkMessage, { t: "seg" }> | null>(null);
  const sendFrameRef = useRef<number | null>(null);
  const flushQueuedSegment = useCallback(() => {
    if (sendFrameRef.current !== null) {
      window.cancelAnimationFrame(sendFrameRef.current);
      sendFrameRef.current = null;
    }
    const queued = queuedSegmentRef.current;
    queuedSegmentRef.current = null;
    if (queued) channelRef.current?.send(queued);
  }, []);
  const queueSegment = useCallback((seg: Extract<InkMessage, { t: "seg" }>) => {
    const queued = queuedSegmentRef.current;
    if (queued && queued.id === seg.id && !queued.end && !seg.start) {
      queued.pts.push(...seg.pts);
    } else {
      flushQueuedSegment();
      queuedSegmentRef.current = { ...seg, pts: [...seg.pts] };
    }
    if (sendFrameRef.current === null) {
      sendFrameRef.current = window.requestAnimationFrame(() => {
        sendFrameRef.current = null;
        const next = queuedSegmentRef.current;
        queuedSegmentRef.current = null;
        if (next) channelRef.current?.send(next);
      });
    }
  }, [flushQueuedSegment]);

  useEffect(() => () => flushQueuedSegment(), [flushQueuedSegment]);

  // Stroke-eraser hit test: does this point touch any finished stroke? Bounding
  // boxes are cached per stroke (invalidated when the point count changes) so
  // the fine distance test only runs on likely candidates.
  const bboxCache = useRef(new WeakMap<InkStroke, { n: number; minX: number; minY: number; maxX: number; maxY: number }>());
  const strokesAt = useCallback((x: number, y: number, reach: number): string[] => {
    const { w, h } = size();
    const hits: string[] = [];
    for (const s of strokesRef.current) {
      if (s.erase || activeRef.current.has(s.id)) continue;
      let bb = bboxCache.current.get(s);
      if (!bb || bb.n !== s.points.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of s.points) {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        }
        bb = { n: s.points.length, minX: minX * w, minY: minY * h, maxX: maxX * w, maxY: maxY * h };
        bboxCache.current.set(s, bb);
      }
      const strokeR = Math.max(2, (s.widthFrac * w) / 2) * 1.4;
      const pad = reach + strokeR;
      if (x < bb.minX - pad || x > bb.maxX + pad || y < bb.minY - pad || y > bb.maxY + pad) continue;
      const pts = s.points;
      let hit = false;
      for (let i = 0; i < pts.length && !hit; i += 1) {
        const ax = pts[i].x * w, ay = pts[i].y * h;
        if (i + 1 < pts.length) {
          const bx = pts[i + 1].x * w, by = pts[i + 1].y * h;
          const dx = bx - ax, dy = by - ay;
          const L2 = dx * dx + dy * dy;
          const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
          const px = ax + dx * t, py = ay + dy * t;
          hit = Math.hypot(x - px, y - py) <= pad;
        } else {
          hit = Math.hypot(x - ax, y - ay) <= pad;
        }
      }
      if (hit) hits.push(s.id);
    }
    return hits;
  }, [size]);

  const eraseAt = useCallback((x: number, y: number) => {
    const reach = Math.max(9, widthRef.current * 1.6);
    const ids = strokesAt(x, y, reach);
    if (!ids.length) return;
    const removed = removeStrokes(ids, true);
    eraseSweepRef.current.push(...removed);
  }, [removeStrokes, strokesAt]);

  // Hold the pen still mid-stroke and the scribble snaps to the clean shape.
  const clearSnapTimer = useCallback(() => {
    if (snapTimerRef.current !== null) { window.clearTimeout(snapTimerRef.current); snapTimerRef.current = null; }
  }, []);
  const trySnap = useCallback(() => {
    snapTimerRef.current = null;
    const id = activeIdRef.current;
    if (!drawingRef.current || !id || snapRef.current) return;
    const active = activeRef.current.get(id);
    const stroke = id ? byIdRef.current.get(id) : null;
    if (!active || !stroke || stroke.erase) return;
    const fit = fitSnapShape(active.px);
    if (!fit) return;
    const { w, h } = size();
    active.px = fit.points;
    stroke.points = fit.points.map((p) => ({ x: p.x / w, y: p.y / h, p: p.p }));
    // A snapped LINE stays live - keep the pen down and the far end follows
    // it. Circles and rectangles freeze as fitted.
    snapRef.current = fit.kind === "line" ? { anchor: fit.points[0], kind: "line" } : null;
    predictedRef.current = [];
    // After a snap the increments stop streaming; the display keeps the raw
    // scribble until pen-up delivers the clean replacement in one message.
    frozenShapeRef.current = true;
    scheduleWet();
  }, [scheduleWet, size]);
  const frozenShapeRef = useRef(false);
  const armSnapTimer = useCallback(() => {
    clearSnapTimer();
    snapTimerRef.current = window.setTimeout(trySnap, HOLD_SNAP_MS);
  }, [clearSnapTimer, trySnap]);

  // Two-finger tap = undo, three-finger tap = redo (fingers are free for
  // gestures because they never draw unless "Finger draws" is on).
  const noteTouchDown = useCallback((e: React.PointerEvent) => {
    touchTapsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, up: false });
  }, []);
  const noteTouchMove = useCallback((e: React.PointerEvent) => {
    const rec = touchTapsRef.current.get(e.pointerId);
    if (rec && Math.hypot(e.clientX - rec.x, e.clientY - rec.y) > 14) rec.moved = true;
  }, []);
  const noteTouchUp = useCallback((e: React.PointerEvent) => {
    const rec = touchTapsRef.current.get(e.pointerId);
    if (!rec) return;
    rec.up = true;
    const all = [...touchTapsRef.current.values()];
    if (!all.every((r) => r.up)) return;
    const now = performance.now();
    const clean = all.every((r) => !r.moved && now - r.t < 500);
    const n = all.length;
    touchTapsRef.current.clear();
    if (!clean) return;
    if (n === 2) performUndo();
    else if (n === 3) performRedo();
  }, [performRedo, performUndo]);

  const onDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    if (e.pointerType === "touch" && !fingerRef.current) { noteTouchDown(e); return; } // palms never mark; fingers become gestures
    measure();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* stale pointer id - drawing still works */ }
    drawingRef.current = true;
    emaRef.current = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.55;
    lastMoveRef.current = null;
    predictedRef.current = [];
    const r = rectRef.current;
    const t = toolRef.current;

    if (t === "laser") {
      const id = crypto.randomUUID();
      laserIdRef.current = id;
      const pt = toNorm(e.clientX, e.clientY, 0.5);
      const { w, h } = size();
      let trail = laserRef.current.get(id);
      if (!trail) { trail = { pts: [] }; laserRef.current.set(id, trail); }
      trail.pts.push({ x: pt.x * w, y: pt.y * h, t: performance.now() });
      channelRef.current?.send({ t: "laser", id, pts: [pt] });
      scheduleWet();
      return;
    }

    if (t === "erase") {
      eraseSweepRef.current = [];
      hoverRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      eraseAt(e.clientX - r.left, e.clientY - r.top);
      scheduleWet();
      return;
    }

    const id = crypto.randomUUID();
    activeIdRef.current = id;
    snapRef.current = null;
    frozenShapeRef.current = false;
    const { w } = size();
    const effPx = t === "pixel" ? widthRef.current * ERASE_SCALE : t === "hl" ? widthRef.current * HL_SCALE : widthRef.current;
    const p = smoothedPressure(e.nativeEvent, e.clientX, e.clientY);
    const seg: Extract<InkMessage, { t: "seg" }> = {
      t: "seg", id, color: colorRef.current, erase: t === "pixel",
      ...(t === "hl" ? { m: "h" as const } : {}),
      widthFrac: effPx / w, pts: [toNorm(e.clientX, e.clientY, p)], start: true,
    };
    applySeg(seg);
    channelRef.current?.send(seg);
    if (t !== "pixel") {
      holdAnchorRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      armSnapTimer();
    }
  }, [applySeg, armSnapTimer, eraseAt, interactive, measure, noteTouchDown, scheduleWet, size, smoothedPressure, toNorm]);

  const onMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    if (e.pointerType === "touch" && !fingerRef.current) { noteTouchMove(e); return; }
    const r = rectRef.current;
    if (!drawingRef.current) {
      if (toolRef.current === "erase" || toolRef.current === "pixel") {
        hoverRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        scheduleWet();
      }
      return;
    }

    // Laser: stream the trail; nothing is stored.
    const laserId = laserIdRef.current;
    if (laserId) {
      const pt = toNorm(e.clientX, e.clientY, 0.5);
      const { w, h } = size();
      const trail = laserRef.current.get(laserId);
      if (trail) trail.pts.push({ x: pt.x * w, y: pt.y * h, t: performance.now() });
      channelRef.current?.send({ t: "laser", id: laserId, pts: [pt] });
      scheduleWet();
      return;
    }

    // Stroke eraser: every touched stroke vanishes whole.
    if (toolRef.current === "erase") {
      hoverRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      const native = e.nativeEvent;
      const coalesced = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
      const sources = coalesced.length ? coalesced : [native];
      for (const ev of sources) eraseAt(ev.clientX - r.left, ev.clientY - r.top);
      scheduleWet();
      return;
    }

    const id = activeIdRef.current;
    const stroke = id ? byIdRef.current.get(id) : null;
    if (!id || !stroke) return;

    // After a snap: a line's far end follows the pen; other shapes are frozen.
    if (frozenShapeRef.current) {
      const snap = snapRef.current;
      if (snap) {
        const active = activeRef.current.get(id);
        if (active) {
          const { w, h } = size();
          const pts = snapLinePoints(snap.anchor, { x: e.clientX - r.left, y: e.clientY - r.top });
          active.px = pts;
          stroke.points = pts.map((p) => ({ x: p.x / w, y: p.y / h, p: p.p }));
          scheduleWet();
        }
      }
      return;
    }

    const native = e.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const sources = coalesced.length ? coalesced : [native];
    const pts: InkPoint[] = sources.map((ev) => toNorm(ev.clientX, ev.clientY, smoothedPressure(ev, ev.clientX, ev.clientY)));
    // Predicted points: drawn on the wet layer this frame, never stored or sent.
    if (!stroke.erase && typeof native.getPredictedEvents === "function") {
      const lastP = pts.length ? pressureOf(pts[pts.length - 1].p) : emaRef.current;
      predictedRef.current = native.getPredictedEvents().slice(0, 4).map((ev) => ({
        x: ev.clientX - r.left, y: ev.clientY - r.top, p: lastP,
      }));
    }
    // Hold-to-straighten: moving past the still-radius re-arms the timer; a
    // pen held inside it lets the timer fire and snap the stroke.
    if (!stroke.erase) {
      const anchor = holdAnchorRef.current;
      if (!anchor || Math.hypot(e.clientX - anchor.x, e.clientY - anchor.y) > HOLD_SNAP_RADIUS) {
        holdAnchorRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
        armSnapTimer();
      }
    }
    const seg: Extract<InkMessage, { t: "seg" }> = {
      t: "seg", id, color: stroke.color, erase: stroke.erase,
      ...(stroke.m === "h" ? { m: "h" as const } : {}),
      widthFrac: stroke.widthFrac, pts,
    };
    applySeg(seg);
    queueSegment(seg);
  }, [applySeg, armSnapTimer, eraseAt, interactive, noteTouchMove, queueSegment, scheduleWet, size, smoothedPressure, toNorm]);

  const onUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (interactive && e.pointerType === "touch" && !fingerRef.current) {
      if (e.type === "pointercancel") touchTapsRef.current.clear();
      else noteTouchUp(e);
      return;
    }
    try { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const wasDrawing = drawingRef.current;
    const id = activeIdRef.current;
    drawingRef.current = false;
    activeIdRef.current = null;
    predictedRef.current = [];
    clearSnapTimer();
    holdAnchorRef.current = null;

    const laserId = laserIdRef.current;
    if (laserId) {
      laserIdRef.current = null;
      channelRef.current?.send({ t: "laser", id: laserId, pts: [], end: true });
      return; // the trail fades out on its own
    }

    if (interactive && wasDrawing && toolRef.current === "erase") {
      if (eraseSweepRef.current.length) {
        recordOp({ kind: "erase", strokes: eraseSweepRef.current });
        eraseSweepRef.current = [];
      }
      return;
    }

    if (interactive && wasDrawing && id) {
      const stroke = byIdRef.current.get(id);
      if (stroke) {
        if (frozenShapeRef.current) {
          // The stroke snapped to a shape: the display has the raw scribble,
          // so hand it the clean replacement in one message and bake locally.
          frozenShapeRef.current = false;
          snapRef.current = null;
          flushQueuedSegment();
          queuedSegmentRef.current = null;
          activeRef.current.delete(id);
          bake(stroke);
          scheduleWet();
          channelRef.current?.send({ t: "replace", stroke });
        } else {
          flushQueuedSegment();
          const endSeg: Extract<InkMessage, { t: "seg" }> = {
            t: "seg", id, color: stroke.color, erase: stroke.erase,
            ...(stroke.m === "h" ? { m: "h" as const } : {}),
            widthFrac: stroke.widthFrac, pts: [], end: true,
          };
          applySeg(endSeg);
          channelRef.current?.send(endSeg);
        }
        recordOp({ kind: "draw", stroke });
      }
    }
  }, [applySeg, bake, clearSnapTimer, flushQueuedSegment, interactive, noteTouchUp, recordOp, scheduleWet]);

  const onLeave = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    hoverRef.current = null;
    scheduleWet();
    onUp(e);
  }, [onUp, scheduleWet]);

  const layerStyle: React.CSSProperties = {
    position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none",
  };

  return (
    <div
      ref={wrapRef}
      style={{
        position: "absolute", inset: 0,
        background: transparent ? "transparent" : "#ffffff",
        overflow: "hidden",
        pointerEvents: passThrough ? "none" : undefined,
      }}
    >
      {bgUrl && !transparent && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={bgImgRef}
          src={bgUrl}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none" }}
        />
      )}
      {displayedProblem && displayedProblem.trim() && !transparent && (
        <div
          style={{
            position: "absolute", inset: 0, padding: "clamp(18px,3.5vw,44px)",
            display: "flex", flexDirection: "column", gap: "clamp(22px,7vh,80px)",
            pointerEvents: "none", userSelect: "none",
          }}
        >
          {displayedProblem.split("\n").map((line) => line.trim()).filter(Boolean).map((line, i) => (
            <div
              key={i}
              style={{
                alignSelf: "flex-start", maxWidth: "74%",
                background: "#fbf7ef", border: "1px solid #ece4d4", borderRadius: 14,
                padding: "12px 22px", fontFamily: "var(--bdb-font)", fontWeight: 700,
                fontSize: "clamp(1.25rem,2.7vw,2.1rem)", lineHeight: 1.25, color: "#201e1a",
              }}
            >
              {line}
            </div>
          ))}
        </div>
      )}
      <canvas ref={hlRef} style={layerStyle} />
      <canvas ref={dryRef} style={layerStyle} />
      <canvas
        ref={wetRef}
        style={{
          ...layerStyle,
          pointerEvents: passThrough || !interactive ? "none" : "auto",
          touchAction: "none",
          cursor: interactive ? (tool === "erase" || tool === "pixel" ? "none" : "crosshair") : "default",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onLeave}
      />
    </div>
  );
}
