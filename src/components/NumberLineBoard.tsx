"use client";

// Interactive single/double number line plus a ratio model for proportional reasoning.
import { PointerEvent, useMemo, useRef, useState } from "react";
import { ToolHeader } from "./ToolHeader";

type NumberLineMode = "single" | "double" | "ratio";
type MarkerTarget = "top" | "bottom";

interface RatioTarget {
  coefficient: number;
  label: string;
  type: "number" | "variable";
  variable?: string;
}

interface RatioTick {
  label: string;
  percent: number;
}

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

function parseRatioTarget(input: string): RatioTarget | null {
  const cleaned = input.trim().replace(/\s/g, "").toLowerCase();
  const numericValue = Number(cleaned);

  if (cleaned && Number.isFinite(numericValue)) {
    return {
      coefficient: numericValue,
      label: formatNumber(numericValue),
      type: "number",
    };
  }

  const variableMatch = cleaned.match(/^(\d+(?:\.\d+)?)?([a-z])$/);

  if (!variableMatch) {
    return null;
  }

  const coefficient = variableMatch[1] ? Number(variableMatch[1]) : 1;
  const variable = variableMatch[2];

  if (!Number.isFinite(coefficient) || coefficient === 0 || !variable) {
    return null;
  }

  return {
    coefficient,
    label: coefficient === 1 ? variable : `${formatNumber(coefficient)}${variable}`,
    type: "variable",
    variable,
  };
}

function buildRatioLabel(target: RatioTarget, multiplier: number): string {
  const value = target.coefficient * multiplier;

  if (value === 0) {
    return "0";
  }

  if (target.type === "number") {
    return formatNumber(value);
  }

  if (value === 1) {
    return target.variable ?? "";
  }

  return `${formatNumber(value)}${target.variable}`;
}

function buildRatioTicks(target: RatioTarget, steps: number): RatioTick[] {
  return Array.from({ length: steps + 1 }, (_, index) => ({
    label: buildRatioLabel(target, index / steps),
    percent: (index / steps) * 100,
  }));
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

interface RatioNumberLineTrackProps {
  highlightIndex: number;
  label: string;
  targetIndex: number;
  ticks: RatioTick[];
}

function RatioNumberLineTrack({
  highlightIndex,
  label,
  targetIndex,
  ticks,
}: RatioNumberLineTrackProps) {
  return (
    <section className="number-line-row" aria-label={label}>
      <div className="number-line-label">{label}</div>
      <div className="number-line-track ratio-track">
        <div className="number-line-axis" />
        {ticks.map((tick, index) => (
          <div
            key={`${label}-${tick.label}-${index}`}
            className={`number-line-tick ${
              index === highlightIndex || index === targetIndex ? "ratio-highlight" : ""
            }`}
            style={{ left: `${tick.percent}%` }}
          >
            <span className="number-line-tick-mark" />
            <span className="number-line-tick-label">{tick.label}</span>
          </div>
        ))}
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
  const [ratioTopLabel, setRatioTopLabel] = useState("Expression");
  const [ratioBottomLabel, setRatioBottomLabel] = useState("Value");
  const [ratioTopValue, setRatioTopValue] = useState("2x");
  const [ratioBottomValue, setRatioBottomValue] = useState(4);
  const [ratioSteps, setRatioSteps] = useState(2);

  const safeMin = Math.min(min, max - 1);
  const safeMax = Math.max(max, min + 1);
  const safeRatioSteps = clamp(Math.round(ratioSteps), 1, 12);
  const ratioTopTarget = parseRatioTarget(ratioTopValue);
  const ratioBottomTarget: RatioTarget = {
    coefficient: Number.isFinite(ratioBottomValue) ? ratioBottomValue : 0,
    label: formatNumber(Number.isFinite(ratioBottomValue) ? ratioBottomValue : 0),
    type: "number",
  };
  const ratioCanRender = Boolean(ratioTopTarget) && ratioBottomTarget.coefficient !== 0;
  const ratioTopTicks = ratioTopTarget ? buildRatioTicks(ratioTopTarget, safeRatioSteps) : [];
  const ratioBottomTicks = buildRatioTicks(ratioBottomTarget, safeRatioSteps);
  const backOneIndex = Math.max(0, safeRatioSteps - 1);
  const backOneTopLabel = ratioTopTicks[backOneIndex]?.label ?? "";
  const backOneBottomLabel = ratioBottomTicks[backOneIndex]?.label ?? "";
  const ratioSolution =
    ratioTopTarget?.type === "variable"
      ? `${ratioTopTarget.variable} = ${formatNumber(ratioBottomTarget.coefficient / ratioTopTarget.coefficient)}`
      : "";

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

  const useTwoXExample = () => {
    setMode("ratio");
    setRatioTopLabel("Expression");
    setRatioBottomLabel("Value");
    setRatioTopValue("2x");
    setRatioBottomValue(4);
    setRatioSteps(2);
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
        <button
          className={`tool-button ${mode === "ratio" ? "active" : ""}`}
          onClick={() => setMode("ratio")}
          type="button"
        >
          Ratio
        </button>
      </ToolHeader>

      <main className="number-line-page">
        {mode === "ratio" ? (
          <section className="number-line-controls ratio-controls">
            <label className="field">
              Top Label
              <input
                className="text-input"
                onChange={(event) => setRatioTopLabel(event.target.value)}
                value={ratioTopLabel}
              />
            </label>
            <label className="field">
              Top End
              <input
                className="text-input"
                onChange={(event) => setRatioTopValue(event.target.value)}
                value={ratioTopValue}
              />
            </label>
            <label className="field">
              Bottom Label
              <input
                className="text-input"
                onChange={(event) => setRatioBottomLabel(event.target.value)}
                value={ratioBottomLabel}
              />
            </label>
            <label className="field">
              Bottom End
              <input
                className="text-input"
                onChange={(event) => setRatioBottomValue(Number(event.target.value))}
                type="number"
                value={ratioBottomValue}
              />
            </label>
            <label className="field">
              Ticks
              <input
                className="text-input"
                max={12}
                min={1}
                onChange={(event) => setRatioSteps(Number(event.target.value))}
                type="number"
                value={ratioSteps}
              />
            </label>
            <button className="small-button primary" onClick={useTwoXExample} type="button">
              Use 2x = 4
            </button>
          </section>
        ) : (
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
        )}

        <section className="number-line-stage">
          {mode === "ratio" ? (
            ratioCanRender && ratioTopTarget ? (
              <>
                <div className="ratio-summary">
                  <strong>{ratioTopTarget.label} matches {ratioBottomTarget.label}</strong>
                  <span>
                    Go back one tick: {backOneTopLabel} matches {backOneBottomLabel}
                    {ratioSolution ? `, so ${ratioSolution}` : ""}.
                  </span>
                </div>
                <div className="ratio-guide" style={{ left: `${(backOneIndex / safeRatioSteps) * 100}%` }}>
                  <span>back one tick</span>
                </div>
                <div className="ratio-guide ratio-guide-target" style={{ left: "100%" }}>
                  <span>given</span>
                </div>
                <RatioNumberLineTrack
                  highlightIndex={backOneIndex}
                  label={ratioTopLabel}
                  targetIndex={safeRatioSteps}
                  ticks={ratioTopTicks}
                />
                <RatioNumberLineTrack
                  highlightIndex={backOneIndex}
                  label={ratioBottomLabel}
                  targetIndex={safeRatioSteps}
                  ticks={ratioBottomTicks}
                />
              </>
            ) : (
              <div className="ratio-summary">
                <strong>Enter a value like 2x over a nonzero number.</strong>
              </div>
            )
          ) : (
            <>
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
            </>
          )}
        </section>
      </main>
    </>
  );
}
