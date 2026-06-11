"use client";

import React, { useState, useRef } from "react";
import { Plus, Trash2, Eye, EyeOff, RotateCcw, AlertCircle, HelpCircle } from "lucide-react";

interface PlottedPoint {
  id: string;
  value: number;
  label?: string;
  isClosed: boolean; // Closed circle vs Open circle for inequalities
  direction: "none" | "left" | "right"; // Inequality arrows
}

export default function NumberLine() {
  const [ticksType, setTicksType] = useState<"integer" | "decimal" | "fraction">("integer");
  const [minVal, setMinVal] = useState<number>(-10);
  const [maxVal, setMaxVal] = useState<number>(10);
  const [points, setPoints] = useState<PlottedPoint[]>([
    { id: "1", value: 3, isClosed: true, direction: "none" },
    { id: "2", value: -2, isClosed: false, direction: "right" } // represents x > -2
  ]);

  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [newPointVal, setNewPointVal] = useState<string>("0");
  const [newPointIsClosed, setNewPointIsClosed] = useState<boolean>(true);
  const [newPointDir, setNewPointDir] = useState<"none" | "left" | "right">("none");
  const [feedback, setFeedback] = useState<string>("Interactive Number Line loaded. Place points and build inequalities!");

  const svgRef = useRef<SVGSVGElement>(null);

  // SVG dimensions
  const width = 800;
  const height = 180;
  const paddingX = 60;
  const lineY = 90;

  const getX = (val: number) => {
    const range = maxVal - minVal;
    return paddingX + ((val - minVal) / range) * (width - 2 * paddingX);
  };

  const getValFromX = (clientX: number) => {
    if (!svgRef.current) return 0;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = clientX - rect.left;
    
    // Scale pixel relX inside [paddingX, width - paddingX] back to [minVal, maxVal]
    const activeWidth = width - 2 * paddingX;
    const pct = (relX - paddingX) / activeWidth;
    let val = minVal + pct * (maxVal - minVal);

    // Snap based on tick type
    if (ticksType === "integer") {
      val = Math.round(val);
    } else if (ticksType === "decimal") {
      // snap to 0.5
      val = Math.round(val * 2) / 2;
    } else {
      // fraction: snap to 0.25 (quarters)
      val = Math.round(val * 4) / 4;
    }

    // Bound checks
    if (val < minVal) val = minVal;
    if (val > maxVal) val = maxVal;

    return val;
  };

  const addPoint = () => {
    const numVal = parseFloat(newPointVal);
    if (isNaN(numVal) || numVal < minVal || numVal > maxVal) {
      setFeedback(`Please type a valid value between ${minVal} and ${maxVal}!`);
      return;
    }

    const newPt: PlottedPoint = {
      id: Date.now().toString(),
      value: numVal,
      isClosed: newPointIsClosed,
      direction: newPointDir
    };

    setPoints([...points, newPt]);
    setFeedback(`Successfully added point at ${numVal}!`);
  };

  const removePoint = (id: string) => {
    setPoints(points.filter(p => p.id !== id));
    setFeedback("Removed selected point.");
  };

  // Drag points handling
  const handleMouseDown = (e: React.MouseEvent, pointId: string) => {
    setActivePointId(pointId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (activePointId === null) return;
    const newVal = getValFromX(e.clientX);
    setPoints(points.map(p => p.id === activePointId ? { ...p, value: newVal } : p));
  };

  const handleMouseUpOrLeave = () => {
    setActivePointId(null);
  };

  // Helper to render fractions beautifully
  const formatValue = (val: number): string => {
    if (ticksType !== "fraction") return val.toString();
    const whole = Math.floor(Math.abs(val));
    const remainder = Math.abs(val) - whole;
    const sign = val < 0 ? "-" : "";

    let fracStr = "";
    if (remainder === 0.25) fracStr = "1/4";
    else if (remainder === 0.5) fracStr = "1/2";
    else if (remainder === 0.75) fracStr = "3/4";

    if (fracStr) {
      if (whole === 0) return `${sign}${fracStr}`;
      return `${sign}${whole} ${fracStr}`;
    }
    return val.toString();
  };

  // Generate tick markers
  const renderTicks = () => {
    const ticks = [];
    const interval = ticksType === "integer" ? 1 : ticksType === "decimal" ? 0.5 : 0.25;
    
    // Label frequency to avoid crowding
    const labelStep = ticksType === "integer" ? 1 : ticksType === "decimal" ? 1 : 1;

    for (let i = minVal; i <= maxVal; i += interval) {
      const x = getX(i);
      const isWhole = Number.isInteger(i);
      const tickHeight = isWhole ? 10 : 6;

      ticks.push(
        <line
          key={`tick-${i}`}
          x1={x}
          y1={lineY - tickHeight}
          x2={x}
          y2={lineY + tickHeight}
          stroke={isWhole ? "#475569" : "#94a3b8"}
          strokeWidth={isWhole ? "2" : "1.25"}
        />
      );

      // Label whole numbers and key fractions
      if (isWhole || (ticksType === "decimal" && i % 1 === 0) || (ticksType === "fraction" && remainderLabel(i))) {
        ticks.push(
          <text
            key={`lbl-${i}`}
            x={x}
            y={lineY + 28}
            textAnchor="middle"
            className="fill-slate-700 font-bold text-xs"
          >
            {formatValue(i)}
          </text>
        );
      }
    }
    return ticks;
  };

  const remainderLabel = (num: number) => {
    const rem = Math.abs(num) % 1;
    return rem === 0 || rem === 0.5;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            📏 Interactive Number Line
            <span className="text-xs px-2.5 py-1 rounded-full bg-sky-50 text-sky-600 font-semibold uppercase tracking-wider">
              Inequalities & Scale
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Drag plotted points, toggle fractional or decimal modes, and visually model inequalities ($x &gt; a$).
          </p>
        </div>

        {/* Scale Switchers */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setTicksType("integer")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              ticksType === "integer" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Integers
          </button>
          <button
            onClick={() => setTicksType("decimal")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              ticksType === "decimal" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Decimals (0.5)
          </button>
          <button
            onClick={() => setTicksType("fraction")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              ticksType === "fraction" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Fractions (Quarters)
          </button>
        </div>
      </div>

      {/* Point Creator Dashboard */}
      <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Value to Plot
          </label>
          <input
            type="number"
            step={ticksType === "integer" ? "1" : ticksType === "decimal" ? "0.5" : "0.25"}
            value={newPointVal}
            onChange={(e) => setNewPointVal(e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Point Circle
          </label>
          <select
            value={newPointIsClosed ? "closed" : "open"}
            onChange={(e) => setNewPointIsClosed(e.target.value === "closed")}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none font-bold text-slate-600"
          >
            <option value="closed">Closed circle (≤, ≥)</option>
            <option value="open">Open circle (&lt;, &gt;)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Inequality Line
          </label>
          <select
            value={newPointDir}
            onChange={(e) => setNewPointDir(e.target.value as any)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none font-bold text-slate-600"
          >
            <option value="none">Point Only</option>
            <option value="left">Shade Left (&lt;)</option>
            <option value="right">Shade Right (&gt;)</option>
          </select>
        </div>

        <div>
          <button
            onClick={addPoint}
            className="w-full py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-lg transition-all shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5"
          >
            <Plus size={14} /> Plot Point
          </button>
        </div>
      </div>

      {/* SVG Number Line Canvas */}
      <div className="relative border border-slate-100 rounded-2xl bg-slate-50 p-4 mb-4 overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          className="w-full h-auto min-w-[700px] select-none"
        >
          {/* Main Line */}
          <line x1={paddingX} y1={lineY} x2={width - paddingX} y2={lineY} stroke="#334155" strokeWidth="4.5" strokeLinecap="round" />
          
          {/* Outer Arrows */}
          <polygon points={`${paddingX},${lineY - 6} ${paddingX - 12},${lineY} ${paddingX},${lineY + 6}`} fill="#334155" />
          <polygon points={`${width - paddingX},${lineY - 6} ${width - paddingX + 12},${lineY} ${width - paddingX},${lineY + 6}`} fill="#334155" />

          {/* Scale Ticks & Numbers */}
          {renderTicks()}

          {/* Inequality Lines shading under/above */}
          {points.map(p => {
            if (p.direction === "none") return null;
            const xVal = getX(p.value);
            const targetX = p.direction === "left" ? paddingX - 12 : width - paddingX + 12;

            return (
              <g key={`shading-${p.id}`} className="pointer-events-none">
                {/* Thick overlay bar */}
                <line
                  x1={xVal}
                  y1={lineY}
                  x2={targetX}
                  y2={lineY}
                  stroke="#3b82f6"
                  strokeWidth="8"
                  opacity="0.5"
                  strokeLinecap="round"
                />
                {/* Inequality Arrow heads */}
                <polygon
                  points={
                    p.direction === "left"
                      ? `${paddingX - 2},${lineY - 7} ${paddingX - 16},${lineY} ${paddingX - 2},${lineY + 7}`
                      : `${width - paddingX + 2},${lineY - 7} ${width - paddingX + 16},${lineY} ${width - paddingX + 2},${lineY + 7}`
                  }
                  fill="#2563eb"
                />
              </g>
            );
          })}

          {/* Render Points on top of ticks/shading */}
          {points.map(p => {
            const x = getX(p.value);
            const isActive = activePointId === p.id;

            return (
              <g
                key={`dot-${p.id}`}
                className="cursor-pointer"
                onMouseDown={(e) => handleMouseDown(e, p.id)}
              >
                {/* Big glow halo on hover/drag */}
                <circle cx={x} cy={lineY} r="16" fill="#3b82f6" opacity={isActive ? "0.2" : "0"} className="hover:opacity-10 transition-all" />

                {/* Main point circle */}
                <circle
                  cx={x}
                  cy={lineY}
                  r="8.5"
                  fill={p.isClosed ? "#2563eb" : "white"}
                  stroke="#2563eb"
                  strokeWidth="3.5"
                />

                {/* Floating exact value display */}
                <text
                  x={x}
                  y={lineY - 20}
                  textAnchor="middle"
                  className="fill-blue-700 font-extrabold text-sm"
                >
                  {formatValue(p.value)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Point details / Inequalities listing for quick removal */}
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
          Plotted Points & Inequalities List
        </h4>
        <div className="flex flex-wrap gap-2">
          {points.map(p => {
            let symbolStr = `Point at x = ${formatValue(p.value)}`;
            if (p.direction === "left") symbolStr = `x ${p.isClosed ? "≤" : "<"} ${formatValue(p.value)}`;
            if (p.direction === "right") symbolStr = `x ${p.isClosed ? "≥" : ">"} ${formatValue(p.value)}`;

            return (
              <div
                key={p.id}
                className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm text-slate-700"
              >
                <span className="font-bold text-blue-600 font-mono">{symbolStr}</span>
                <button
                  onClick={() => removePoint(p.id)}
                  className="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-all"
                  title="Remove point"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          {points.length === 0 && (
            <p className="text-xs text-slate-400">No active points. Click on input panel above to plot one!</p>
          )}
        </div>
      </div>
    </div>
  );
}