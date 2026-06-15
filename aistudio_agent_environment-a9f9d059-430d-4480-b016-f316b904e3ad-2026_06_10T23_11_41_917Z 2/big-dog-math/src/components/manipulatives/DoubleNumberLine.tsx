"use client";

import React, { useState } from "react";
import { Lock, Unlock, Plus, Trash2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";

interface DoubleLinePoint {
  id: string;
  topValue: number;
  bottomValue: number;
  label?: string;
  isLocked: boolean;
  studentInputTop?: string;
  studentInputBottom?: string;
  showTopValue: boolean;
  showBottomValue: boolean;
}

export default function DoubleNumberLine() {
  const [isTeacherMode, setIsTeacherMode] = useState<boolean>(true);
  const [topUnit, setTopUnit] = useState<string>("cups");
  const [bottomUnit, setBottomUnit] = useState<string>("ounces");
  
  // Starting ratio example: 3 cups = 24 ounces (scale is 1 cup = 8 ounces)
  const [points, setPoints] = useState<DoubleLinePoint[]>([
    { id: "1", topValue: 0, bottomValue: 0, isLocked: true, showTopValue: true, showBottomValue: true },
    { id: "2", topValue: 1, bottomValue: 8, isLocked: false, showTopValue: true, showBottomValue: true },
    { id: "3", topValue: 3, bottomValue: 24, isLocked: false, showTopValue: true, showBottomValue: true },
    { id: "4", topValue: 5, bottomValue: 40, isLocked: false, showTopValue: false, showBottomValue: false, studentInputTop: "", studentInputBottom: "" },
  ]);

  const [activePreset, setActivePreset] = useState<string>("cups-ounces");
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" | null }>({ message: "", type: null });

  // Preset definitions
  const presets = {
    "cups-ounces": { top: "cups", bottom: "ounces", baseTop: 3, baseBottom: 24 },
    "miles-km": { top: "miles", bottom: "kilometers", baseTop: 5, baseBottom: 8 },
    "tickets-cost": { top: "tickets", bottom: "dollars ($)", baseTop: 4, baseBottom: 36 },
    "percent-decimal": { top: "percent (%)", bottom: "decimal", baseTop: 20, baseBottom: 0.20 },
  };

  const loadPreset = (key: keyof typeof presets) => {
    setActivePreset(key);
    const p = presets[key];
    setTopUnit(p.top);
    setBottomUnit(p.bottom);
    
    // Generate clean equivalent ratio points
    setPoints([
      { id: "1", topValue: 0, bottomValue: 0, isLocked: true, showTopValue: true, showBottomValue: true },
      { id: "2", topValue: p.baseTop * 1, bottomValue: p.baseBottom * 1, isLocked: false, showTopValue: true, showBottomValue: true },
      { id: "3", topValue: p.baseTop * 2, bottomValue: p.baseBottom * 2, isLocked: false, showTopValue: true, showBottomValue: true },
      { id: "4", topValue: p.baseTop * 3, bottomValue: p.baseBottom * 3, isLocked: false, showTopValue: false, showBottomValue: false, studentInputTop: "", studentInputBottom: "" },
    ]);
    setFeedback({ message: `Loaded preset: ${p.top} to ${p.bottom}`, type: "info" });
  };

  const addPoint = () => {
    // Determine proportional scale from first non-zero point
    const refPoint = points.find(p => p.topValue !== 0 && p.bottomValue !== 0);
    const ratio = refPoint ? refPoint.bottomValue / refPoint.topValue : 8;
    
    const maxTop = Math.max(...points.map(p => p.topValue));
    const nextTop = maxTop + (refPoint ? refPoint.topValue : 1);
    const nextBottom = nextTop * ratio;

    const newPoint: DoubleLinePoint = {
      id: Date.now().toString(),
      topValue: Number(nextTop.toFixed(2)),
      bottomValue: Number(nextBottom.toFixed(2)),
      isLocked: false,
      showTopValue: true,
      showBottomValue: true
    };
    
    setPoints([...points, newPoint].sort((a, b) => a.topValue - b.topValue));
    setFeedback({ message: "Added a new proportional point!", type: "success" });
  };

  const removePoint = (id: string) => {
    if (points.length <= 2) {
      setFeedback({ message: "You need at least two points for a ratio comparison!", type: "error" });
      return;
    }
    const filtered = points.filter(p => p.id !== id);
    setPoints(filtered);
  };

  const toggleLock = (id: string) => {
    setPoints(points.map(p => p.id === id ? { ...p, isLocked: !p.isLocked } : p));
  };

  const toggleVisibility = (id: string, line: "top" | "bottom") => {
    setPoints(points.map(p => {
      if (p.id === id) {
        if (line === "top") {
          return { ...p, showTopValue: !p.showTopValue, studentInputTop: p.showTopValue ? "" : undefined };
        } else {
          return { ...p, showBottomValue: !p.showBottomValue, studentInputBottom: p.showBottomValue ? "" : undefined };
        }
      }
      return p;
    }));
  };

  const handleStudentInputChange = (id: string, line: "top" | "bottom", val: string) => {
    setPoints(points.map(p => {
      if (p.id === id) {
        return line === "top"
          ? { ...p, studentInputTop: val }
          : { ...p, studentInputBottom: val };
      }
      return p;
    }));
  };

  const checkStudentAnswers = () => {
    let allCorrect = true;
    let hasInputs = false;

    points.forEach(p => {
      if (!p.showTopValue && p.studentInputTop !== undefined) {
        hasInputs = true;
        const val = parseFloat(p.studentInputTop);
        if (isNaN(val) || Math.abs(val - p.topValue) > 0.01) {
          allCorrect = false;
        }
      }
      if (!p.showBottomValue && p.studentInputBottom !== undefined) {
        hasInputs = true;
        const val = parseFloat(p.studentInputBottom);
        if (isNaN(val) || Math.abs(val - p.bottomValue) > 0.01) {
          allCorrect = false;
        }
      }
    });

    if (!hasInputs) {
      setFeedback({ message: "There are no empty values to fill in!", type: "info" });
    } else if (allCorrect) {
      setFeedback({ message: "Amazing work! Every ratio scales proportionally! 🎉", type: "success" });
    } else {
      setFeedback({ message: "Some values are incorrect. Let's look at how the scaling works!", type: "error" });
    }
  };

  // SVG parameters
  const width = 800;
  const height = 240;
  const paddingX = 80;
  const lineYTop = 80;
  const lineYBottom = 160;

  // Max value for horizontal scale
  const maxVal = Math.max(...points.map(p => p.topValue), 10);

  const getX = (val: number) => {
    if (maxVal === 0) return paddingX;
    return paddingX + (val / maxVal) * (width - 2 * paddingX);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            🐶 Double Number Line
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 font-semibold uppercase tracking-wider">
              Ratios & Proportions
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Explore how quantities scale together. Complete ratios, percents, and rates.
          </p>
        </div>

        {/* Mode Toggle Button */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => {
              setIsTeacherMode(true);
              setFeedback({ message: "", type: null });
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              isTeacherMode
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Teacher Mode
          </button>
          <button
            onClick={() => {
              setIsTeacherMode(false);
              setFeedback({ message: "Fill in the blank boxes and click 'Check Answers'!", type: "info" });
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              !isTeacherMode
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Student Mode
          </button>
        </div>
      </div>

      {/* Preset and Custom Controls (Teacher Mode) */}
      {isTeacherMode && (
        <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Quick Ratio Presets
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => loadPreset("cups-ounces")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    activePreset === "cups-ounces"
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  3 cups : 24 oz
                </button>
                <button
                  onClick={() => loadPreset("miles-km")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    activePreset === "miles-km"
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  5 miles : 8 km
                </button>
                <button
                  onClick={() => loadPreset("tickets-cost")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    activePreset === "tickets-cost"
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  4 tickets : $36
                </button>
                <button
                  onClick={() => loadPreset("percent-decimal")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    activePreset === "percent-decimal"
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  20% : 0.20
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Customize Unit Labels
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Top line unit"
                  value={topUnit}
                  onChange={(e) => setTopUnit(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Bottom line unit"
                  value={bottomUnit}
                  onChange={(e) => setBottomUnit(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Points list for manual tuning / hiding */}
          <div className="mt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Teacher Lock & Hide Settings
            </h4>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-2">
              {points.map((point) => (
                <div key={point.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs shadow-sm">
                  <span className="font-bold text-indigo-600">
                    ({point.topValue} : {point.bottomValue})
                  </span>
                  
                  {/* Hide Top Button */}
                  <button
                    onClick={() => toggleVisibility(point.id, "top")}
                    className={`p-1 rounded hover:bg-slate-100 ${point.showTopValue ? "text-slate-600" : "text-amber-500 font-bold"}`}
                    title="Toggle top value visibility to students"
                  >
                    {point.showTopValue ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>

                  {/* Hide Bottom Button */}
                  <button
                    onClick={() => toggleVisibility(point.id, "bottom")}
                    className={`p-1 rounded hover:bg-slate-100 ${point.showBottomValue ? "text-slate-600" : "text-amber-500 font-bold"}`}
                    title="Toggle bottom value visibility to students"
                  >
                    {point.showBottomValue ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>

                  {/* Lock Button */}
                  <button
                    onClick={() => toggleLock(point.id)}
                    className="p-1 rounded hover:bg-slate-100 text-slate-600"
                    title="Lock/Unlock point dragging"
                  >
                    {point.isLocked ? <Lock size={14} className="text-indigo-600" /> : <Unlock size={14} />}
                  </button>

                  {/* Delete Button */}
                  {point.topValue !== 0 && (
                    <button
                      onClick={() => removePoint(point.id)}
                      className="p-1 rounded hover:bg-red-50 text-red-500"
                      title="Remove point"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addPoint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-indigo-300 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 text-xs font-semibold transition-all"
              >
                <Plus size={14} /> Add Proportional Value
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SVG Interactive Double Number Line Rendering */}
      <div className="relative border border-slate-100 rounded-2xl bg-slate-50 p-4 mb-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[700px] select-none">
          {/* Top Line Label */}
          <text x={paddingX - 10} y={lineYTop + 5} textAnchor="end" className="fill-slate-600 font-semibold text-sm capitalize">
            {topUnit}
          </text>
          
          {/* Bottom Line Label */}
          <text x={paddingX - 10} y={lineYBottom + 5} textAnchor="end" className="fill-slate-600 font-semibold text-sm capitalize">
            {bottomUnit}
          </text>

          {/* Connections / Proportional Visual Connectors */}
          {points.map((p) => {
            const x = getX(p.topValue);
            return (
              <g key={`connect-${p.id}`} className="transition-all duration-300">
                <line
                  x1={x}
                  y1={lineYTop}
                  x2={x}
                  y2={lineYBottom}
                  stroke={p.isLocked ? "#c7d2fe" : "#e2e8f0"}
                  strokeWidth="2"
                  strokeDasharray="4,4"
                />
              </g>
            );
          })}

          {/* Double Lines */}
          <line x1={paddingX} y1={lineYTop} x2={width - paddingX} y2={lineYTop} stroke="#4f46e5" strokeWidth="4" strokeLinecap="round" />
          <line x1={paddingX} y1={lineYBottom} x2={width - paddingX} y2={lineYBottom} stroke="#0ea5e9" strokeWidth="4" strokeLinecap="round" />

          {/* Arrow heads */}
          <polygon points={`${width - paddingX},${lineYTop - 6} ${width - paddingX + 12},${lineYTop} ${width - paddingX},${lineYTop + 6}`} fill="#4f46e5" />
          <polygon points={`${width - paddingX},${lineYBottom - 6} ${width - paddingX + 12},${lineYBottom} ${width - paddingX},${lineYBottom + 6}`} fill="#0ea5e9" />

          {/* Points, Ticks and Labels */}
          {points.map((p) => {
            const x = getX(p.topValue);

            return (
              <g key={`pt-${p.id}`} className="transition-all duration-300">
                {/* Ticks */}
                <line x1={x} y1={lineYTop - 6} x2={x} y2={lineYTop + 6} stroke="#4f46e5" strokeWidth="3" />
                <line x1={x} y1={lineYBottom - 6} x2={x} y2={lineYBottom + 6} stroke="#0ea5e9" strokeWidth="3" />

                {/* Point Indicators */}
                <circle cx={x} cy={lineYTop} r="5" fill="#4f46e5" />
                <circle cx={x} cy={lineYBottom} r="5" fill="#0ea5e9" />

                {/* Value Displays (Top) */}
                {p.showTopValue || isTeacherMode ? (
                  <g>
                    {/* Background capsule for teacher-hidden info */}
                    {!p.showTopValue && (
                      <rect x={x - 22} y={lineYTop - 34} width="44" height="22" rx="4" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1" />
                    )}
                    <text
                      x={x}
                      y={lineYTop - 18}
                      textAnchor="middle"
                      className={`text-sm font-bold ${!p.showTopValue ? "fill-amber-700" : "fill-slate-800"}`}
                    >
                      {p.topValue}
                    </text>
                  </g>
                ) : null}

                {/* Value Displays (Bottom) */}
                {p.showBottomValue || isTeacherMode ? (
                  <g>
                    {!p.showBottomValue && (
                      <rect x={x - 22} y={lineYBottom + 12} width="44" height="22" rx="4" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1" />
                    )}
                    <text
                      x={x}
                      y={lineYBottom + 28}
                      textAnchor="middle"
                      className={`text-sm font-bold ${!p.showBottomValue ? "fill-amber-700" : "fill-slate-800"}`}
                    >
                      {p.bottomValue}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* Floating Input boxes in Student Mode */}
        {!isTeacherMode && (
          <div className="absolute inset-0 pointer-events-none flex justify-around">
            {points.map((p) => {
              const xPercent = `${((getX(p.topValue) / width) * 100).toFixed(1)}%`;
              return (
                <div
                  key={`inputs-${p.id}`}
                  style={{ left: xPercent }}
                  className="absolute pointer-events-auto transform -translate-x-1/2 flex flex-col h-full py-2 justify-between"
                >
                  {/* Top Blank Input Box */}
                  {!p.showTopValue && (
                    <div style={{ top: "35px" }} className="absolute">
                      <input
                        type="text"
                        placeholder="?"
                        value={p.studentInputTop || ""}
                        onChange={(e) => handleStudentInputChange(p.id, "top", e.target.value)}
                        className="w-14 h-9 text-center bg-amber-50 border-2 border-amber-300 text-slate-800 rounded-lg font-bold shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                  )}

                  {/* Bottom Blank Input Box */}
                  {!p.showBottomValue && (
                    <div style={{ top: "165px" }} className="absolute">
                      <input
                        type="text"
                        placeholder="?"
                        value={p.studentInputBottom || ""}
                        onChange={(e) => handleStudentInputChange(p.id, "bottom", e.target.value)}
                        className="w-14 h-9 text-center bg-amber-50 border-2 border-amber-300 text-slate-800 rounded-lg font-bold shadow focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Interactive feedback & student verification */}
      {feedback.message && (
        <div
          className={`flex items-start gap-2.5 p-4 rounded-xl border mb-6 transition-all ${
            feedback.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : feedback.type === "error"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-indigo-50 border-indigo-100 text-indigo-900"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          ) : feedback.type === "error" ? (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="text-sm font-medium">{feedback.message}</p>
            {feedback.type === "success" && (
              <p className="text-xs text-green-600 mt-1">
                You can clearly see that {points.find(p => p.topValue !== 0)?.topValue} {topUnit} matches {points.find(p => p.topValue !== 0)?.bottomValue} {bottomUnit}, which scales beautifully across the entire line!
              </p>
            )}
          </div>
        </div>
      )}

      {/* Student View Options */}
      {!isTeacherMode && (
        <div className="flex justify-between items-center bg-slate-50 border border-slate-100 p-4 rounded-xl">
          <p className="text-xs text-slate-500 max-w-md">
            <strong>Hint:</strong> Look at the ratio between existing pairs. Find the multiplier (rate) and apply it to scale up or down!
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setPoints(points.map(p => ({
                  ...p,
                  studentInputTop: p.showTopValue ? "" : undefined,
                  studentInputBottom: p.showBottomValue ? "" : undefined
                })));
                setFeedback({ message: "Cleared all values! Try again.", type: "info" });
              }}
              className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all shadow-sm"
            >
              Reset Blank Values
            </button>
            <button
              onClick={checkStudentAnswers}
              className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-xl transition-all shadow-md shadow-indigo-100 flex items-center gap-1.5"
            >
              Check Answers
            </button>
          </div>
        </div>
      )}

      {/* Quick Visual Explanation */}
      <div className="mt-4 bg-indigo-50/50 border border-indigo-100/30 rounded-xl p-4">
        <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-1">
          How to read this tool:
        </h4>
        <p className="text-xs text-slate-600 leading-relaxed">
          For any vertical line crossing both number lines, the ratio of top to bottom values remains constant. 
          For example: <span className="font-semibold text-indigo-600">3 {topUnit} / 24 {bottomUnit} = 0.125 {topUnit} per {bottomUnit}</span>. 
          You can slide and adjust points as needed to visualize the rate!
        </p>
      </div>
    </div>
  );
}