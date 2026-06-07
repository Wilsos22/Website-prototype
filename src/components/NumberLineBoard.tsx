"use client";

// Interactive single/double number line with aligned draggable markers.
import { PointerEvent, useMemo, useRef, useState } from "react";
import { ToolHeader } from "./ToolHeader";

type NumberLineMode = "single" | "double";
type MarkerTarget = "top" | "bottom";

const tickCount = 11;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function markerPercent(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 100;
}

interface NumberLineTrackProps {
  label: string;
  max: number;
  min: number;
  onPointerDown: (target: MarkerTarget, event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (target: MarkerTarget, event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  target: MarkerTarget;
  ticks: number[];
  value: number;
}

function NumberLineTrack({
  label,
  max,
  min,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  target,
  ticks,
  value,
}: NumberLineTrackProps) {
  return (
    <section className="number-line-row" aria-label={label}>
      <div className="number-line-label">{label}</div>
      <div
        className="number-line-track"
        onPointerCancel={onPointerUp}
        onPointerDown={(event) => onPointerDown(target, event)}
        onPointerMove={(event) => onPointerMove(target, event)}
        onPointerUp={onPointerUp}
      >
        <div className="number-line-axis" />
        {ticks.map((tick) => (
          <div
            key={`${label}-${tick}`}
            className="number-line-tick"
            style={{ left: `${markerPercent(tick, min, max)}%` }}
          >
            <span className="number-line-tick-mark" />
            <span className="number-line-tick-label">{formatNumber(tick)}</span>
          </div>
        ))}
        <div
          className="number-line-marker"
          style={{ left: `${markerPercent(value, min, max)}%` }}
        >
          <span>{formatNumber(value)}</span>
        </div>
      </div>
    </section>
  );
}

export function NumberLineBoard() {
  const activeMarkerRef = useRef<MarkerTarget | null>(null);
  const [mode, setMode] = useState<NumberLineMode>("single");
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(10);
  const [topLabel, setTopLabel] = useState("Line 1");
  const [bottomLabel, setBottomLabel] = useState("Line 2");
  const [topValue, setTopValue] = useState(5);
  const [bottomValue, setBottomValue] = useState(5);

  const safeMin = Math.min(min, max - 1);
  const safeMax = Math.max(max, min + 1);

  const ticks = useMemo(() => {
    const step = (safeMax - safeMin) / (tickCount - 1);

    return Array.from({ length: tickCount }, (_, index) => safeMin + index * step);
  }, [safeMax, safeMin]);

  const updateMarker = (target: MarkerTarget, event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const rawValue = safeMin + percent * (safeMax - safeMin);
    const snappedValue = Math.round(rawValue * 4) / 4;

    if (target === "top") {
      setTopValue(clamp(snappedValue, safeMin, safeMax));
    } else {
      setBottomValue(clamp(snappedValue, safeMin, safeMax));
    }
  };

  const startDrag = (target: MarkerTarget, event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    activeMarkerRef.current = target;
    updateMarker(target, event);
  };

  const continueDrag = (target: MarkerTarget, event: PointerEvent<HTMLDivElement>) => {
    if (activeMarkerRef.current !== target) {
      return;
    }

    updateMarker(target, event);
  };

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activeMarkerRef.current = null;
  };

  return (
    <>
      <ToolHeader title="Number Line">
        <button
          className={`tool-button ${mode === "single" ? "active" : ""}`}
          onClick={() => setMode("single")}
          type="button"
        >
          Single
        </button>
        <button
          className={`tool-button ${mode === "double" ? "active" : ""}`}
          onClick={() => setMode("double")}
          type="button"
        >
          Double
        </button>
      </ToolHeader>

      <main className="number-line-page">
        <section className="number-line-controls">
          <label className="field">
            Min
            <input
              className="text-input"
              onChange={(event) => setMin(Number(event.target.value))}
              type="number"
              value={min}
            />
          </label>
          <label className="field">
            Max
            <input
              className="text-input"
              onChange={(event) => setMax(Number(event.target.value))}
              type="number"
              value={max}
            />
          </label>
          <label className="field">
            Top Label
            <input
              className="text-input"
              onChange={(event) => setTopLabel(event.target.value)}
              value={topLabel}
            />
          </label>
          {mode === "double" && (
            <label className="field">
              Bottom Label
              <input
                className="text-input"
                onChange={(event) => setBottomLabel(event.target.value)}
                value={bottomLabel}
              />
            </label>
          )}
        </section>

        <section className="number-line-stage">
          <NumberLineTrack
            label={topLabel}
            max={safeMax}
            min={safeMin}
            onPointerDown={startDrag}
            onPointerMove={continueDrag}
            onPointerUp={stopDrag}
            target="top"
            ticks={ticks}
            value={clamp(topValue, safeMin, safeMax)}
          />
          {mode === "double" && (
            <NumberLineTrack
              label={bottomLabel}
              max={safeMax}
              min={safeMin}
              onPointerDown={startDrag}
              onPointerMove={continueDrag}
              onPointerUp={stopDrag}
              target="bottom"
              ticks={ticks}
              value={clamp(bottomValue, safeMin, safeMax)}
            />
          )}
        </section>
      </main>
    </>
  );
}
