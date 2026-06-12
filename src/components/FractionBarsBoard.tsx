"use client";

// Draggable fraction bars with selected-piece duplicate, delete, and snap controls.
import { useCallback, useEffect, useRef, useState } from "react";
import { ToolHeader } from "./ToolHeader";

interface FractionBar {
  id: string;
  label: string;
  denominator: number;
  value: number;
  color: string;
  x: number;
  y: number;
}

const fractionTemplates = [
  { label: "1", denominator: 1, value: 1, color: "#245caa" },
  { label: "1/2", denominator: 2, value: 1 / 2, color: "#159a8c" },
  { label: "1/3", denominator: 3, value: 1 / 3, color: "#6f5fbf" },
  { label: "1/4", denominator: 4, value: 1 / 4, color: "#d89028" },
  { label: "1/6", denominator: 6, value: 1 / 6, color: "#d95555" },
  { label: "1/8", denominator: 8, value: 1 / 8, color: "#4b7f52" },
  { label: "1/12", denominator: 12, value: 1 / 12, color: "#8c5a2f" },
] as const;

const leftGuideFallback = 24;
const rowGuide = 24;
const denominatorGrid = 24;
const fallbackColumnStep = 30;
const rowStep = 62;

function createInitialBars(guideLeft: number): FractionBar[] {
  return fractionTemplates.map((template, index) => ({
    ...template,
    id: `${template.label}-starter`,
    x: guideLeft,
    y: rowGuide + index * rowStep,
  }));
}

function snapToGuide(value: number, origin: number, step: number): number {
  return origin + Math.round((value - origin) / step) * step;
}

export function FractionBarsBoard() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const guideLeftRef = useRef(leftGuideFallback);
  const [bars, setBars] = useState<FractionBar[]>(() => createInitialBars(leftGuideFallback));
  const [selectedBarId, setSelectedBarId] = useState(`${fractionTemplates[0].label}-starter`);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [guideLeft, setGuideLeft] = useState(leftGuideFallback);
  const [columnStep, setColumnStep] = useState(fallbackColumnStep);

  const updateCenteredGuide = useCallback(() => {
    const stage = stageRef.current;
    const ruler = rulerRef.current;

    if (!stage || !ruler) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    const rulerRect = ruler.getBoundingClientRect();
    const borderLeft = Number.parseFloat(window.getComputedStyle(stage).borderLeftWidth) || 0;
    const nextGuideLeft = Math.max(0, rulerRect.left - stageRect.left - borderLeft);
    const nextColumnStep = rulerRect.width / denominatorGrid;
    const shift = nextGuideLeft - guideLeftRef.current;

    guideLeftRef.current = nextGuideLeft;
    setGuideLeft(nextGuideLeft);
    setColumnStep(nextColumnStep);

    if (Math.abs(shift) > 1) {
      setBars((currentBars) =>
        currentBars.map((bar) => ({
          ...bar,
          x: Math.max(0, bar.x + shift),
        })),
      );
    }
  }, []);

  useEffect(() => {
    updateCenteredGuide();
    window.addEventListener("resize", updateCenteredGuide);

    return () => {
      window.removeEventListener("resize", updateCenteredGuide);
    };
  }, [updateCenteredGuide]);

  const resetLayout = useCallback(() => {
    const nextBars = createInitialBars(guideLeft);
    setBars(nextBars);
    setSelectedBarId(nextBars[0]?.id ?? "");
  }, [guideLeft]);

  const moveBar = useCallback((id: string, x: number, y: number) => {
    setBars((currentBars) =>
      currentBars.map((bar) =>
        bar.id === id
          ? {
              ...bar,
              x: snapToGrid ? snapToGuide(Math.max(0, x), guideLeft, columnStep) : Math.max(0, x),
              y: snapToGrid ? snapToGuide(Math.max(0, y), rowGuide, rowStep) : Math.max(0, y),
            }
          : bar,
      ),
    );
  }, [columnStep, guideLeft, snapToGrid]);

  const duplicateSelectedBar = useCallback(() => {
    setBars((currentBars) => {
      const selectedBar = currentBars.find((bar) => bar.id === selectedBarId);

      if (!selectedBar) {
        return currentBars;
      }

      const nextBar = {
        ...selectedBar,
        id: `${selectedBar.label}-${crypto.randomUUID()}`,
        x: selectedBar.x + 36,
        y: selectedBar.y + 36,
      };

      setSelectedBarId(nextBar.id);
      return [...currentBars, nextBar];
    });
  }, [selectedBarId]);

  const deleteSelectedBar = useCallback(() => {
    setBars((currentBars) => {
      const nextBars = currentBars.filter((bar) => bar.id !== selectedBarId);
      setSelectedBarId(nextBars[0]?.id ?? "");
      return nextBars;
    });
  }, [selectedBarId]);

  const snapAllBars = useCallback(() => {
    setBars((currentBars) =>
      currentBars.map((bar) => ({
        ...bar,
        x: snapToGuide(bar.x, guideLeft, columnStep),
        y: snapToGuide(bar.y, rowGuide, rowStep),
      })),
    );
  }, [columnStep, guideLeft]);

  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>, bar: FractionBar) => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const stageRect = stage.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedBarId(bar.id);
    dragRef.current = {
      id: bar.id,
      offsetX: event.clientX - stageRect.left - bar.x,
      offsetY: event.clientY - stageRect.top - bar.y,
    };
  }, []);

  const continueDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const stage = stageRef.current;
      const drag = dragRef.current;

      if (!stage || !drag) {
        return;
      }

      const stageRect = stage.getBoundingClientRect();
      const x = event.clientX - stageRect.left - drag.offsetX;
      const y = event.clientY - stageRect.top - drag.offsetY;
      moveBar(drag.id, Math.max(0, x), Math.max(0, y));
    },
    [moveBar],
  );

  const stopDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
  }, []);

  return (
    <>
      <ToolHeader title="Fraction Bars">
        <button
          className="small-button"
          disabled={!selectedBarId}
          onClick={duplicateSelectedBar}
          type="button"
        >
          Duplicate
        </button>
        <button
          className="small-button danger"
          disabled={!selectedBarId}
          onClick={deleteSelectedBar}
          type="button"
        >
          Delete
        </button>
        <button
          className={`small-button ${snapToGrid ? "active" : ""}`}
          onClick={() => setSnapToGrid((currentValue) => !currentValue)}
          type="button"
        >
          Snap Grid
        </button>
        <button className="small-button" onClick={snapAllBars} type="button">
          Snap All
        </button>
        <button className="tool-button" onClick={resetLayout} type="button">
          Reset
        </button>
      </ToolHeader>

      <main className="fraction-board">
        <div ref={rulerRef} className="fraction-ruler" aria-hidden="true">
          Whole width
        </div>
        <section
          ref={stageRef}
          className="fraction-stage"
          aria-label="Fraction bar workspace"
          onPointerCancel={stopDrag}
          onPointerMove={continueDrag}
          onPointerUp={stopDrag}
          style={{
            backgroundPosition: `${guideLeft}px ${rowGuide}px, ${guideLeft}px ${rowGuide}px, ${guideLeft}px ${rowGuide}px`,
            backgroundSize: `${columnStep}px ${rowStep}px, ${columnStep}px ${rowStep}px, ${columnStep}px ${rowStep}px`,
          }}
        >
          {bars.map((bar) => (
            <div
              key={bar.id}
              aria-label={`${bar.label} fraction bar`}
              className={`fraction-bar ${selectedBarId === bar.id ? "selected" : ""}`}
              onPointerDown={(event) => startDrag(event, bar)}
              style={{
                background: bar.color,
                left: bar.x,
                top: bar.y,
                width: `calc(var(--whole-width) * ${bar.value})`,
              }}
              tabIndex={0}
            >
              <span className="fraction-label">{bar.label}</span>
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
