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
import { fillDot, fillOutline, highlightOutline, strokeOutline, type InkRenderPoint } from "@/lib/inkGeometry";

export type InkTool = "pen" | "hl" | "erase";

const HL_ALPHA = 0.36;
const ERASE_SCALE = 5; // eraser is 5x the dialled pen width, as before
const HL_SCALE = 3; // highlighter band is 3x the dialled pen width

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
  exportSignal?: number; // bump to export the board as a PNG
  onExport?: (dataUrl: string) => void; // receives the flattened PNG; if absent, downloads
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
  exportSignal = 0,
  onExport,
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
    if (hover && interactive && toolRef.current === "erase" && !drawingRef.current) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(32,30,26,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, (widthRef.current * ERASE_SCALE) / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [ctxOf, interactive, paintStroke, size]);

  const scheduleWet = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      paintWet();
    });
  }, [paintWet]);

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
    const { w, h } = size();
    for (const c of [hlRef.current, dryRef.current, wetRef.current]) ctxOf(c)?.clearRect(0, 0, w, h);
  }, [ctxOf, size]);

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
      else if (m.t === "hello") {
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
    }, onConnectionChange);
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

  // Clear signal from the toolbar.
  const lastClearRef = useRef(0);
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

  const lastExportRef = useRef(0);
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

  const onDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    if (e.pointerType === "touch" && !fingerRef.current) return; // palms never mark
    measure();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* stale pointer id - drawing still works */ }
    drawingRef.current = true;
    emaRef.current = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.55;
    lastMoveRef.current = null;
    predictedRef.current = [];
    const id = crypto.randomUUID();
    activeIdRef.current = id;
    const { w } = size();
    const t = toolRef.current;
    const effPx = t === "erase" ? widthRef.current * ERASE_SCALE : t === "hl" ? widthRef.current * HL_SCALE : widthRef.current;
    const p = smoothedPressure(e.nativeEvent, e.clientX, e.clientY);
    const seg: Extract<InkMessage, { t: "seg" }> = {
      t: "seg", id, color: colorRef.current, erase: t === "erase",
      ...(t === "hl" ? { m: "h" as const } : {}),
      widthFrac: effPx / w, pts: [toNorm(e.clientX, e.clientY, p)], start: true,
    };
    applySeg(seg);
    channelRef.current?.send(seg);
  }, [applySeg, interactive, measure, size, smoothedPressure, toNorm]);

  const onMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const r = rectRef.current;
    if (!drawingRef.current) {
      if (toolRef.current === "erase") {
        hoverRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
        scheduleWet();
      }
      return;
    }
    const id = activeIdRef.current;
    const stroke = id ? byIdRef.current.get(id) : null;
    if (!id || !stroke) return;
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
    const seg: Extract<InkMessage, { t: "seg" }> = {
      t: "seg", id, color: stroke.color, erase: stroke.erase,
      ...(stroke.m === "h" ? { m: "h" as const } : {}),
      widthFrac: stroke.widthFrac, pts,
    };
    applySeg(seg);
    queueSegment(seg);
  }, [applySeg, interactive, queueSegment, scheduleWet, smoothedPressure, toNorm]);

  const onUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    try { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const wasDrawing = drawingRef.current;
    const id = activeIdRef.current;
    drawingRef.current = false;
    activeIdRef.current = null;
    predictedRef.current = [];
    if (interactive && wasDrawing && id) {
      const stroke = byIdRef.current.get(id);
      if (stroke) {
        flushQueuedSegment();
        const endSeg: Extract<InkMessage, { t: "seg" }> = {
          t: "seg", id, color: stroke.color, erase: stroke.erase,
          ...(stroke.m === "h" ? { m: "h" as const } : {}),
          widthFrac: stroke.widthFrac, pts: [], end: true,
        };
        applySeg(endSeg);
        channelRef.current?.send(endSeg);
      }
    }
  }, [applySeg, flushQueuedSegment, interactive]);

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
          cursor: interactive ? (tool === "erase" ? "none" : "crosshair") : "default",
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
