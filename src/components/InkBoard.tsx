"use client";

// Shared ink surface for the iPad pen and the board display.
// - Two stacked layers: a background <img> (blank / PDF page / image) and a
//   transparent ink <canvas> on top, so the eraser reveals the background.
// - Strokes are stored and sent in normalised 0..1 coords (see inkSync.ts), so
//   the iPad and the board can be different sizes and still match.

import { useCallback, useEffect, useRef, useState } from "react";
import { joinInkRoom, type InkChannel, type InkMessage, type InkPoint, type InkStroke } from "@/lib/inkSync";

interface InkBoardProps {
  room: string;
  interactive: boolean; // the iPad draws; the board display does not
  color?: string;
  erase?: boolean;
  penWidth?: number; // px on this surface
  background?: string | null; // data URL, controlled by the pen page
  problem?: string | null; // problem(s) to show with space to solve
  clearSignal?: number; // bump to clear
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
}: InkBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const strokeSegment = useCallback(
    (s: { color: string; erase: boolean; widthFrac: number }, a: InkPoint, b: InkPoint) => {
      const context = ctx();
      if (!context) return;
      const { w, h } = size();
      context.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
      context.strokeStyle = s.color;
      context.lineWidth = Math.max(1, s.widthFrac * w);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      context.moveTo(a.x * w, a.y * h);
      context.lineTo(b.x * w, b.y * h);
      context.stroke();
    },
    [ctx, size],
  );

  const drawDot = useCallback(
    (s: { color: string; erase: boolean; widthFrac: number }, p: InkPoint) => {
      const context = ctx();
      if (!context || s.erase) return;
      const { w, h } = size();
      context.globalCompositeOperation = "source-over";
      context.fillStyle = s.color;
      context.beginPath();
      context.arc(p.x * w, p.y * h, Math.max(0.5, (s.widthFrac * w) / 2), 0, Math.PI * 2);
      context.fill();
    },
    [ctx, size],
  );

  // Apply one incoming/local segment: draw it and append to the stored stroke.
  const applySeg = useCallback(
    (seg: Extract<InkMessage, { t: "seg" }>) => {
      let stroke = byIdRef.current.get(seg.id);
      if (!stroke || seg.start) {
        stroke = { id: seg.id, color: seg.color, erase: seg.erase, widthFrac: seg.widthFrac, points: [] };
        byIdRef.current.set(seg.id, stroke);
        strokesRef.current.push(stroke);
      }
      let prev = stroke.points[stroke.points.length - 1];
      for (const p of seg.pts) {
        if (prev) strokeSegment(seg, prev, p);
        else drawDot(seg, p);
        stroke.points.push(p);
        prev = p;
      }
    },
    [strokeSegment, drawDot],
  );

  const redraw = useCallback(() => {
    const context = ctx();
    const c = canvasRef.current;
    if (!context || !c) return;
    const { w, h } = size();
    context.clearRect(0, 0, w, h);
    for (const s of strokesRef.current) {
      for (let i = 1; i < s.points.length; i += 1) strokeSegment(s, s.points[i - 1], s.points[i]);
      if (s.points.length === 1) drawDot(s, s.points[0]);
    }
  }, [ctx, size, strokeSegment, drawDot]);

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
    });
    channelRef.current = channel;
    if (!interactive) channel.send({ t: "hello" }); // ask the pen for current state
    return () => channel.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, interactive]);

  const bgUrlRef = useRef<string | null>(null);
  useEffect(() => { bgUrlRef.current = bgUrl; }, [bgUrl]);
  const problemRef = useRef<string | null>(null);
  useEffect(() => { problemRef.current = problemText; }, [problemText]);

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

  // ── Pointer drawing (pen surface only) ──────────────────────────────────────
  const toNorm = useCallback((e: React.PointerEvent<HTMLCanvasElement>): InkPoint => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }, []);

  const onDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
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
    }));
    const seg: Extract<InkMessage, { t: "seg" }> = {
      t: "seg", id, color: stroke.color, erase: stroke.erase, widthFrac: stroke.widthFrac, pts,
    };
    applySeg(seg);
    channelRef.current?.send(seg);
  }, [interactive, toNorm, applySeg]);

  const onUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    drawingRef.current = false;
    activeIdRef.current = null;
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#ffffff", overflow: "hidden" }}>
      {bgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgUrl}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", userSelect: "none" }}
        />
      )}
      {problemText && problemText.trim() && (
        <div
          style={{
            position: "absolute", inset: 0, padding: "clamp(18px,3.5vw,44px)",
            display: "flex", flexDirection: "column", gap: "clamp(22px,7vh,80px)",
            pointerEvents: "none", userSelect: "none",
          }}
        >
          {problemText.split("\n").map((line) => line.trim()).filter(Boolean).map((line, i) => (
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
