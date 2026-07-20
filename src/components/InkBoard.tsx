"use client";

// Shared ink surface for the iPad pen and the board display.
// - Two stacked layers: a background <img> (blank / PDF page / image) and a
//   transparent ink <canvas> on top, so the eraser reveals the background.
// - Strokes are stored and sent in normalised 0..1 coords (see inkSync.ts), so
//   the iPad and the board can be different sizes and still match.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  joinInkRoom,
  type InkChannel,
  type InkConnectionStatus,
  type InkMessage,
  type InkPoint,
  type InkStroke,
} from "@/lib/inkSync";

// Smoothing + pressure helpers (module scope so render callbacks stay stable).
function midPoint(a: InkPoint, b: InkPoint): InkPoint { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function pressureOf(p?: number): number { return p && p > 0 && p <= 1 ? p : 0.5; }

interface InkBoardProps {
  room: string;
  interactive: boolean; // the iPad draws; the board display does not
  color?: string;
  erase?: boolean;
  penWidth?: number; // px on this surface
  background?: string | null; // data URL, controlled by the pen page
  problem?: string | null; // problem(s) to show with space to solve
  clearSignal?: number; // bump to clear
  exportSignal?: number; // bump to export the board as a PNG
  onExport?: (dataUrl: string) => void; // receives the flattened PNG; if absent, downloads
  onConnectionChange?: (status: InkConnectionStatus) => void;
}

export default function InkBoard({
  room,
  interactive,
  color = "#111827",
  erase = false,
  penWidth = 5,
  background = null,
  problem = null,
  clearSignal = 0,
  exportSignal = 0,
  onExport,
  onConnectionChange,
}: InkBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [problemText, setProblemText] = useState<string | null>(null);

  const channelRef = useRef<InkChannel | null>(null);
  const strokesRef = useRef<InkStroke[]>([]);
  const byIdRef = useRef<Map<string, InkStroke>>(new Map());
  const drawingRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);

  // Latest tool settings, read inside pointer handlers.
  const colorRef = useRef(color);
  const eraseRef = useRef(erase);
  const widthRef = useRef(penWidth);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { eraseRef.current = erase; }, [erase]);
  useEffect(() => { widthRef.current = penWidth; }, [penWidth]);

  const ctx = useCallback(() => canvasRef.current?.getContext("2d") ?? null, []);
  const size = useCallback(() => {
    const c = canvasRef.current;
    const r = c?.getBoundingClientRect();
    return { w: r?.width ?? 1, h: r?.height ?? 1 };
  }, []);

  // Line width in CSS px at a point: pen width scales with Pencil pressure; eraser stays constant.
  const lwPx = useCallback(
    (s: { erase: boolean; widthFrac: number }, p: InkPoint, w: number) =>
      Math.max(1, s.widthFrac * w * (s.erase ? 1 : 0.45 + 0.95 * pressureOf(p.p))),
    [],
  );

  const stamp = useCallback(
    (s: { color: string; erase: boolean }, lw: number, draw: (c: CanvasRenderingContext2D) => void) => {
      const context = ctx();
      if (!context) return;
      context.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      context.strokeStyle = s.color;
      context.fillStyle = s.color;
      context.lineWidth = lw;
      context.lineCap = "round";
      context.lineJoin = "round";
      draw(context);
    },
    [ctx],
  );

  // Draw the smoothed piece of a stroke that ends at point index i (quadratic through midpoints).
  const drawIndex = useCallback(
    (s: InkStroke, i: number, w: number, h: number) => {
      const pts = s.points;
      if (i <= 0) {
        const lw = lwPx(s, pts[0], w);
        stamp(s, lw, (c) => { c.beginPath(); c.arc(pts[0].x * w, pts[0].y * h, lw / 2, 0, Math.PI * 2); c.fill(); });
        return;
      }
      if (i === 1) {
        const a = pts[0], b = midPoint(pts[0], pts[1]);
        stamp(s, lwPx(s, pts[1], w), (c) => { c.beginPath(); c.moveTo(a.x * w, a.y * h); c.lineTo(b.x * w, b.y * h); c.stroke(); });
        return;
      }
      const a = midPoint(pts[i - 2], pts[i - 1]), ctrl = pts[i - 1], b = midPoint(pts[i - 1], pts[i]);
      stamp(s, lwPx(s, ctrl, w), (c) => {
        c.beginPath();
        c.moveTo(a.x * w, a.y * h);
        c.quadraticCurveTo(ctrl.x * w, ctrl.y * h, b.x * w, b.y * h);
        c.stroke();
      });
    },
    [lwPx, stamp],
  );

  const drawEnd = useCallback(
    (s: InkStroke, w: number, h: number) => {
      const pts = s.points;
      if (pts.length < 2) return;
      const a = midPoint(pts[pts.length - 2], pts[pts.length - 1]), b = pts[pts.length - 1];
      stamp(s, lwPx(s, b, w), (c) => { c.beginPath(); c.moveTo(a.x * w, a.y * h); c.lineTo(b.x * w, b.y * h); c.stroke(); });
    },
    [lwPx, stamp],
  );

  // Apply one incoming/local segment: append points and draw their smoothed pieces.
  const applySeg = useCallback(
    (seg: Extract<InkMessage, { t: "seg" }>) => {
      let stroke = byIdRef.current.get(seg.id);
      if (!stroke || seg.start) {
        stroke = { id: seg.id, color: seg.color, erase: seg.erase, widthFrac: seg.widthFrac, points: [] };
        byIdRef.current.set(seg.id, stroke);
        strokesRef.current.push(stroke);
      }
      const { w, h } = size();
      for (const p of seg.pts) {
        stroke.points.push(p);
        drawIndex(stroke, stroke.points.length - 1, w, h);
      }
      if (seg.end) drawEnd(stroke, w, h);
    },
    [size, drawIndex, drawEnd],
  );

  const redraw = useCallback(() => {
    const context = ctx();
    const c = canvasRef.current;
    if (!context || !c) return;
    const { w, h } = size();
    context.clearRect(0, 0, w, h);
    for (const s of strokesRef.current) {
      for (let i = 0; i < s.points.length; i += 1) drawIndex(s, i, w, h);
      drawEnd(s, w, h);
    }
  }, [ctx, size, drawIndex, drawEnd]);

  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.max(1, Math.floor(r.width * dpr));
    c.height = Math.max(1, Math.floor(r.height * dpr));
    const context = c.getContext("2d");
    if (context) context.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }, [redraw]);

  const clearLocal = useCallback(() => {
    strokesRef.current = [];
    byIdRef.current.clear();
    const context = ctx();
    const { w, h } = size();
    context?.clearRect(0, 0, w, h);
  }, [ctx, size]);

  // ── Channel ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = joinInkRoom(room, (m) => {
      if (m.t === "seg") applySeg(m);
      else if (m.t === "clear") clearLocal();
      else if (m.t === "bg") setBgUrl(m.url);
      else if (m.t === "problem") setProblemText(m.text);
      else if (m.t === "hello" && interactive) {
        channel.send({ t: "state", strokes: strokesRef.current, bg: bgUrlRef.current, problem: problemRef.current });
      } else if (m.t === "state" && !interactive) {
        clearLocal();
        for (const s of m.strokes) {
          byIdRef.current.set(s.id, s);
          strokesRef.current.push(s);
        }
        setBgUrl(m.bg);
        setProblemText(m.problem);
        redraw();
      }
    }, onConnectionChange);
    channelRef.current = channel;
    if (!interactive) channel.send({ t: "hello" }); // ask the pen for current state
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
    return () => window.removeEventListener("resize", resize);
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

  // Flatten everything (white + background + problems + ink) to a PNG.
  const buildExportCanvas = useCallback((): HTMLCanvasElement | null => {
    const live = canvasRef.current;
    if (!live) return null;
    const rect = live.getBoundingClientRect();
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

    o.drawImage(live, 0, 0, W, H); // ink (pen + eraser already baked in)
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
  const toNorm = useCallback((e: React.PointerEvent<HTMLCanvasElement>): InkPoint => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p: e.pressure };
  }, []);

  const penSeenRef = useRef(false);
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
    if (e.pointerType === "pen") penSeenRef.current = true;
    else if (e.pointerType === "touch" && penSeenRef.current) return; // palm/finger rejected once the Pencil is in use
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const id = crypto.randomUUID();
    activeIdRef.current = id;
    const { w } = size();
    const effPx = eraseRef.current ? widthRef.current * 5 : widthRef.current;
    const seg: Extract<InkMessage, { t: "seg" }> = {
      t: "seg", id, color: colorRef.current, erase: eraseRef.current,
      widthFrac: effPx / w, pts: [toNorm(e)], start: true,
    };
    applySeg(seg);
    channelRef.current?.send(seg);
  }, [interactive, size, toNorm, applySeg]);

  const onMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive || !drawingRef.current) return;
    const id = activeIdRef.current;
    const stroke = id ? byIdRef.current.get(id) : null;
    if (!id || !stroke) return;
    const r = e.currentTarget.getBoundingClientRect();
    const native = e.nativeEvent;
    const coalesced = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const sources = coalesced.length ? coalesced : [native];
    const pts: InkPoint[] = sources.map((ev) => ({
      x: (ev.clientX - r.left) / r.width,
      y: (ev.clientY - r.top) / r.height,
      p: ev.pressure,
    }));
    const seg: Extract<InkMessage, { t: "seg" }> = {
      t: "seg", id, color: stroke.color, erase: stroke.erase, widthFrac: stroke.widthFrac, pts,
    };
    applySeg(seg);
    queueSegment(seg);
  }, [interactive, applySeg, queueSegment]);

  const onUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const wasDrawing = drawingRef.current;
    const id = activeIdRef.current;
    drawingRef.current = false;
    activeIdRef.current = null;
    if (interactive && wasDrawing && id) {
      const stroke = byIdRef.current.get(id);
      if (stroke) {
        flushQueuedSegment();
        const endSeg: Extract<InkMessage, { t: "seg" }> = {
          t: "seg", id, color: stroke.color, erase: stroke.erase, widthFrac: stroke.widthFrac, pts: [], end: true,
        };
        applySeg(endSeg);
        channelRef.current?.send(endSeg);
      }
    }
  }, [interactive, applySeg, flushQueuedSegment]);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#ffffff", overflow: "hidden" }}>
      {bgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={bgImgRef}
          src={bgUrl}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none" }}
        />
      )}
      {displayedProblem && displayedProblem.trim() && (
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
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: interactive ? "crosshair" : "default" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
      />
    </div>
  );
}
