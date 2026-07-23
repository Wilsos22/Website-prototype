"use client";

// Slide extras editor - the Canva-lite layer over the auto-generated slides.
// Pick a lesson and a step, place text, math-font equations, shapes, and
// images over a stage that stands in for the auto slide, and save the layout
// to the step's Slide Overlay property in Notion. The projector renders the
// same layout above the real slide through the live-flow snapshot.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteNav from "@/components/SiteNav";
import { OverlayElementView } from "@/components/SlideOverlayLayer";
import { teacherApiRequest } from "@/lib/teacherApi";
import {
  parseSlideOverlay,
  serializeSlideOverlay,
  SLIDE_OVERLAY_COLORS,
  type SlideOverlayElement,
  type SlideOverlayElementType,
} from "@/lib/slideOverlay";

interface LessonListItem { id: string; lessonCode: string; title: string }
interface LessonStepItem {
  id: string;
  title: string;
  stateId: string;
  mainDisplay?: string;
  studentDirections?: string;
  slideOverlay?: string;
}
interface EditableStepResponse {
  step: { id: string; lastEditedTime: string; slideOverlay?: string };
}

const ADDABLE: Array<{ type: SlideOverlayElementType; label: string }> = [
  { type: "text", label: "Text" },
  { type: "equation", label: "Equation" },
  { type: "rect", label: "Rectangle" },
  { type: "circle", label: "Circle" },
  { type: "line", label: "Line" },
  { type: "arrow", label: "Arrow" },
  { type: "image", label: "Image" },
];

function newElement(type: SlideOverlayElementType): SlideOverlayElement {
  const id = Math.random().toString(36).slice(2, 10);
  if (type === "line" || type === "arrow") {
    return { id, type, x: 34, y: 50, x2: 66, y2: 50, color: "#201e1a", thickness: 5 };
  }
  if (type === "rect" || type === "circle") {
    return { id, type, x: 38, y: 36, w: 24, h: type === "circle" ? 28 : 22, color: "#50a3a4", thickness: 5, fill: false };
  }
  if (type === "image") {
    return { id, type, x: 34, y: 30, w: 32, h: 36, url: "" };
  }
  return {
    id, type, x: 30, y: 42, w: 40,
    text: type === "equation" ? "4(10 + 6) = 4 {x}/{y}" : "New text",
    color: "#201e1a",
    size: type === "equation" ? 7 : 6,
  };
}

export default function SlideExtrasPage() {
  const [lessons, setLessons] = useState<LessonListItem[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [steps, setSteps] = useState<LessonStepItem[]>([]);
  const [stepId, setStepId] = useState("");
  const [elements, setElements] = useState<SlideOverlayElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editToken, setEditToken] = useState("");
  const [status, setStatus] = useState("Pick a lesson to decorate its slides.");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize" | "start" | "end";
    startX: number;
    startY: number;
    origin: SlideOverlayElement;
  } | null>(null);

  const step = steps.find((candidate) => candidate.id === stepId) || null;
  const selected = elements.find((element) => element.id === selectedId) || null;

  useEffect(() => {
    void (async () => {
      try {
        const result = await teacherApiRequest<{ lessons: LessonListItem[] }>("/api/teacher/lessons");
        setLessons(result.lessons.filter((lesson) => lesson.lessonCode));
        const requested = new URLSearchParams(window.location.search).get("lessonId")?.trim();
        if (requested) setLessonId(requested);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Published lessons could not be loaded.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!lessonId) { setSteps([]); setStepId(""); return; }
    let cancelled = false;
    setStatus("Loading lesson steps.");
    void (async () => {
      try {
        const result = await teacherApiRequest<{ lesson: { steps: LessonStepItem[] } | null }>(
          `/api/teacher/lesson?id=${encodeURIComponent(lessonId)}`,
        );
        if (cancelled) return;
        const loaded = result.lesson?.steps || [];
        setSteps(loaded);
        setStepId((current) => (current && loaded.some((candidate) => candidate.id === current) ? current : loaded[0]?.id || ""));
        setStatus(loaded.length ? "Choose a step, then add extras." : "This lesson has no steps yet.");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "The lesson could not be loaded.");
      }
    })();
    return () => { cancelled = true; };
  }, [lessonId]);

  // Selecting a step loads its saved overlay and the edit token that guards
  // the save against a concurrent Notion edit.
  useEffect(() => {
    if (!lessonId || !stepId) { setElements([]); setEditToken(""); return; }
    let cancelled = false;
    void (async () => {
      try {
        const result = await teacherApiRequest<EditableStepResponse>(
          `/api/teacher/lesson-step?lessonId=${encodeURIComponent(lessonId)}&stepId=${encodeURIComponent(stepId)}`,
        );
        if (cancelled) return;
        setEditToken(result.step.lastEditedTime);
        setElements(parseSlideOverlay(result.step.slideOverlay)?.elements || []);
        setSelectedId(null);
        setDirty(false);
        setStatus("Add extras, drag them into place, then save.");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "The step could not be loaded.");
      }
    })();
    return () => { cancelled = true; };
  }, [lessonId, stepId]);

  const updateSelected = useCallback((patch: Partial<SlideOverlayElement>) => {
    setElements((current) => current.map((element) => (element.id === selectedId ? { ...element, ...patch } : element)));
    setDirty(true);
  }, [selectedId]);

  function addElement(type: SlideOverlayElementType) {
    const element = newElement(type);
    setElements((current) => [...current, element]);
    setSelectedId(element.id);
    setDirty(true);
  }

  function removeSelected() {
    if (!selectedId) return;
    setElements((current) => current.filter((element) => element.id !== selectedId));
    setSelectedId(null);
    setDirty(true);
  }

  function stagePercent(event: PointerEvent | React.PointerEvent): { x: number; y: number } | null {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  }

  const onStagePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = stagePercent(event);
    if (!point) return;
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    const origin = drag.origin;
    setElements((current) => current.map((element) => {
      if (element.id !== drag.id) return element;
      if (drag.mode === "move") {
        const moved: SlideOverlayElement = { ...element, x: origin.x + dx, y: origin.y + dy };
        if (origin.x2 != null) moved.x2 = (origin.x2 ?? 0) + dx;
        if (origin.y2 != null) moved.y2 = (origin.y2 ?? 0) + dy;
        return moved;
      }
      if (drag.mode === "resize") {
        return {
          ...element,
          w: Math.max(4, (origin.w ?? 20) + dx),
          ...(origin.h != null ? { h: Math.max(4, (origin.h ?? 12) + dy) } : {}),
        };
      }
      if (drag.mode === "start") return { ...element, x: origin.x + dx, y: origin.y + dy };
      return { ...element, x2: (origin.x2 ?? 0) + dx, y2: (origin.y2 ?? 0) + dy };
    }));
    setDirty(true);
  }, []);

  const onStagePointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onStagePointerMove);
  }, [onStagePointerMove]);

  function beginDrag(event: React.PointerEvent, id: string, mode: "move" | "resize" | "start" | "end") {
    event.preventDefault();
    event.stopPropagation();
    const point = stagePercent(event);
    const origin = elements.find((element) => element.id === id);
    if (!point || !origin) return;
    setSelectedId(id);
    dragRef.current = { id, mode, startX: point.x, startY: point.y, origin: { ...origin } };
    window.addEventListener("pointermove", onStagePointerMove);
    window.addEventListener("pointerup", onStagePointerUp, { once: true });
  }

  async function save() {
    if (!lessonId || !stepId || saving) return;
    setSaving(true);
    setStatus("Saving to Notion.");
    try {
      const result = await teacherApiRequest<EditableStepResponse>("/api/teacher/lesson-step", {
        method: "PATCH",
        body: JSON.stringify({
          lessonId,
          stepId,
          expectedLastEditedTime: editToken,
          changes: { slideOverlay: serializeSlideOverlay({ v: 1, elements }) },
        }),
      });
      setEditToken(result.step.lastEditedTime);
      setDirty(false);
      setStatus("Saved. The projector shows these extras the next time this step runs.");
    } catch (error) {
      setStatus(error instanceof Error ? `${error.message} Reload the step to pick up the latest version.` : "The overlay could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const stageHeight = stageRef.current?.clientHeight || 540;
  const backgroundText = useMemo(() => (step?.mainDisplay || step?.studentDirections || "").trim(), [step]);

  return (
    <main className="sx-page">
      <style>{`
        .sx-page { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); padding-bottom:44px; }
        .sx-wrap { max-width:1240px; margin:0 auto; padding:14px clamp(12px,3vw,28px); display:grid; gap:14px; }
        .sx-head { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
        .sx-head h1 { margin:0 8px 0 0; font-size:clamp(1.3rem,2.6vw,1.8rem); font-weight:800; letter-spacing:-0.02em; }
        .sx-sel { border:2px solid var(--bdb-line); border-radius:11px; background:var(--bdb-card); color:var(--bdb-ink); padding:10px 12px; font:inherit; font-weight:700; max-width:340px; }
        .sx-status { margin:0; color:var(--bdb-ink-soft); font-size:0.9rem; font-weight:650; }
        .sx-body { display:grid; grid-template-columns:minmax(0,1fr) 250px; gap:14px; align-items:start; }
        @media (max-width:900px) { .sx-body { grid-template-columns:1fr; } }
        .sx-stagewrap { display:grid; gap:10px; }
        .sx-toolbar { display:flex; flex-wrap:wrap; gap:8px; }
        .sx-tool { border:1px solid var(--bdb-line); border-radius:999px; background:var(--bdb-card); color:var(--bdb-ink); padding:9px 15px; font:inherit; font-weight:800; font-size:0.88rem; cursor:pointer; }
        .sx-tool:hover { border-color:var(--bdb-teal); }
        .sx-stage { position:relative; width:100%; aspect-ratio:16 / 9; overflow:hidden; border:1px solid var(--bdb-line); border-radius:16px;
          background-color:#F3F0E7; background-image:radial-gradient(circle,#CBC4B2 1px,transparent 1.3px); background-size:18px 18px;
          box-shadow:0 2px 10px rgba(40,32,20,0.06); touch-action:none; }
        .sx-underlay { position:absolute; inset:0; display:grid; place-items:center; padding:6%; text-align:center; pointer-events:none; }
        .sx-underlay p { margin:0; color:var(--bdb-ink); opacity:0.26; font-size:clamp(1.1rem,2.6vw,2.2rem); font-weight:800; white-space:pre-wrap; }
        .sx-underlay span { position:absolute; top:10px; left:14px; color:var(--bdb-ink-faint); font-size:0.64rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; opacity:0.8; }
        .sx-el { position:absolute; inset:0; }
        .sx-hit { position:absolute; cursor:grab; border:2px dashed transparent; border-radius:10px; }
        .sx-hit.selected { border-color:var(--bdb-teal); }
        .sx-handle { position:absolute; width:16px; height:16px; border-radius:50%; background:var(--bdb-teal); border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.3); cursor:nwse-resize; }
        .sx-panel { display:grid; gap:12px; border:1px solid var(--bdb-line); border-radius:16px; background:var(--bdb-card); padding:14px; }
        .sx-panel h2 { margin:0; font-size:0.72rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:var(--bdb-ink-faint); }
        .sx-panel textarea, .sx-panel input[type="text"] { width:100%; box-sizing:border-box; border:2px solid var(--bdb-line); border-radius:10px; background:var(--bdb-ground); color:var(--bdb-ink); padding:9px 10px; font:inherit; font-size:0.9rem; font-weight:600; resize:vertical; }
        .sx-swatches { display:flex; flex-wrap:wrap; gap:7px; }
        .sx-swatch { width:28px; height:28px; border-radius:50%; border:2px solid var(--bdb-line); cursor:pointer; }
        .sx-swatch.on { border-color:var(--bdb-ink); box-shadow:0 0 0 2px #fff inset; }
        .sx-row { display:flex; align-items:center; gap:9px; font-size:0.84rem; font-weight:700; color:var(--bdb-ink-soft); }
        .sx-row input[type="range"] { flex:1; }
        .sx-del { border:1px solid #efd6d2; border-radius:11px; background:#fff; color:#b91c1c; padding:10px 14px; font:inherit; font-weight:900; cursor:pointer; }
        .sx-save { border:0; border-radius:12px; background:var(--bdb-ink); color:#fff; padding:13px 20px; font:inherit; font-weight:900; font-size:1rem; cursor:pointer; }
        .sx-save:disabled { opacity:0.45; cursor:default; }
        .sx-hint { margin:0; color:var(--bdb-ink-faint); font-size:0.78rem; font-weight:650; line-height:1.4; }
        .sx-steps { display:flex; gap:7px; overflow-x:auto; padding-bottom:2px; }
        .sx-step { flex:none; border:1px solid var(--bdb-line); border-radius:999px; background:var(--bdb-card); color:var(--bdb-ink-soft); padding:8px 13px; font:inherit; font-size:0.82rem; font-weight:800; cursor:pointer; white-space:nowrap; }
        .sx-step.on { background:var(--bdb-ink); border-color:var(--bdb-ink); color:#fff; }
        .sx-step small { opacity:0.7; font-weight:700; }
      `}</style>

      <SiteNav variant="teacher" />
      <div className="sx-wrap">
        <div className="sx-head">
          <h1>Slide extras</h1>
          <select className="sx-sel" value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
            <option value="">Choose a published lesson</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>{lesson.lessonCode} - {lesson.title}</option>
            ))}
          </select>
          <button className="sx-save" onClick={save} disabled={!dirty || saving || !stepId}>
            {saving ? "Saving" : dirty ? "Save to Notion" : "Saved"}
          </button>
        </div>
        <p className="sx-status" role="status">{status}</p>

        {steps.length > 0 && (
          <div className="sx-steps">
            {steps.map((candidate, index) => (
              <button
                key={candidate.id}
                className={`sx-step${candidate.id === stepId ? " on" : ""}`}
                onClick={() => setStepId(candidate.id)}
              >
                {index + 1}. {candidate.title || candidate.stateId} <small>{candidate.stateId}</small>
              </button>
            ))}
          </div>
        )}

        {stepId && (
          <div className="sx-body">
            <div className="sx-stagewrap">
              <div className="sx-toolbar">
                {ADDABLE.map((item) => (
                  <button key={item.type} className="sx-tool" onClick={() => addElement(item.type)}>Add {item.label}</button>
                ))}
              </div>
              <div className="sx-stage" ref={stageRef} onPointerDown={() => setSelectedId(null)}>
                <div className="sx-underlay">
                  <span>Auto slide underneath</span>
                  {backgroundText ? <p>{backgroundText}</p> : null}
                </div>
                <div className="sx-el">
                  {elements.map((element) => (
                    <OverlayElementView key={element.id} element={element} stageHeight={stageHeight} />
                  ))}
                </div>
                {elements.map((element) => {
                  const isLine = element.type === "line" || element.type === "arrow";
                  if (isLine) {
                    return (
                      <span key={element.id}>
                        <span
                          className="sx-handle"
                          style={{ left: `calc(${element.x}% - 8px)`, top: `calc(${element.y}% - 8px)`, cursor: "grab" }}
                          onPointerDown={(event) => beginDrag(event, element.id, "start")}
                        />
                        <span
                          className="sx-handle"
                          style={{ left: `calc(${element.x2 ?? element.x}% - 8px)`, top: `calc(${element.y2 ?? element.y}% - 8px)`, cursor: "grab" }}
                          onPointerDown={(event) => beginDrag(event, element.id, "end")}
                        />
                      </span>
                    );
                  }
                  const height = element.h != null ? `${element.h}%` : "12%";
                  return (
                    <span key={element.id}>
                      <span
                        className={`sx-hit${element.id === selectedId ? " selected" : ""}`}
                        style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.w ?? 20}%`, height }}
                        onPointerDown={(event) => beginDrag(event, element.id, "move")}
                      />
                      {element.id === selectedId ? (
                        <span
                          className="sx-handle"
                          style={{ left: `calc(${element.x + (element.w ?? 20)}% - 8px)`, top: `calc(${element.y}% + ${height} - 8px)` }}
                          onPointerDown={(event) => beginDrag(event, element.id, "resize")}
                        />
                      ) : null}
                    </span>
                  );
                })}
              </div>
              <p className="sx-hint">
                Drag to place. Positions are percentages of the projector stage, so the layout scales to any display.
                Equations: letters go italic automatically, caret makes a power (x^2), and {"{3}/{4}"} stacks a fraction.
              </p>
            </div>

            <aside className="sx-panel">
              <h2>{selected ? `Selected: ${selected.type}` : "Nothing selected"}</h2>
              {selected ? (
                <>
                  {(selected.type === "text" || selected.type === "equation") && (
                    <textarea
                      rows={3}
                      value={selected.text || ""}
                      onChange={(event) => updateSelected({ text: event.target.value })}
                    />
                  )}
                  {selected.type === "image" && (
                    <input
                      type="text"
                      placeholder="Image URL (/lesson-covers/... or https://...)"
                      value={selected.url || ""}
                      onChange={(event) => updateSelected({ url: event.target.value })}
                    />
                  )}
                  {selected.type !== "image" && (
                    <div className="sx-swatches">
                      {SLIDE_OVERLAY_COLORS.map((swatch) => (
                        <button
                          key={swatch.value}
                          className={`sx-swatch${selected.color === swatch.value ? " on" : ""}`}
                          style={{ background: swatch.value }}
                          title={swatch.name}
                          onClick={() => updateSelected({ color: swatch.value })}
                        />
                      ))}
                    </div>
                  )}
                  {(selected.type === "text" || selected.type === "equation") && (
                    <label className="sx-row">Size
                      <input
                        type="range" min={2} max={18} step={0.5}
                        value={selected.size ?? 6}
                        onChange={(event) => updateSelected({ size: Number(event.target.value) })}
                      />
                    </label>
                  )}
                  {(selected.type === "rect" || selected.type === "circle" || selected.type === "line" || selected.type === "arrow") && (
                    <label className="sx-row">Thickness
                      <input
                        type="range" min={1} max={16} step={1}
                        value={selected.thickness ?? 4}
                        onChange={(event) => updateSelected({ thickness: Number(event.target.value) })}
                      />
                    </label>
                  )}
                  {(selected.type === "rect" || selected.type === "circle") && (
                    <label className="sx-row">
                      <input
                        type="checkbox"
                        checked={Boolean(selected.fill)}
                        onChange={(event) => updateSelected({ fill: event.target.checked })}
                      />
                      Filled
                    </label>
                  )}
                  <button className="sx-del" onClick={removeSelected}>Delete element</button>
                </>
              ) : (
                <p className="sx-hint">Add an element from the toolbar, or tap one on the stage to edit it.</p>
              )}
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
