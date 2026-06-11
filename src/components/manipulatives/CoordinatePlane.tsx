"use client";

import React, { useState, useEffect, useRef } from "react";
import { CheckCircle2, AlertCircle, RefreshCw, Eye, EyeOff, Save, Compass, HelpCircle } from "lucide-react";

interface Point2D {
  x: number;
  y: number;
  label?: string;
  id: string;
}

export default function CoordinatePlane() {
  const [mode, setMode] = useState<"plot" | "identify">("plot");
  const [quadrants, setQuadrants] = useState<"all" | "quad1">("all");
  const [gridSize, setGridSize] = useState<number>(10); // Grid goes from -gridSize to gridSize
  const [targetPoint, setTargetPoint] = useState<Point2D>({ x: 3, y: -2, id: "target" });
  const [studentPlotted, setStudentPlotted] = useState<Point2D | null>(null);
  
  // Student input for "identify" mode
  const [inputX, setInputX] = useState<string>("");
  const [inputY, setInputY] = useState<string>("");
  
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" | null }>({ message: "", type: null });
  const [showHint, setShowHint] = useState<boolean>(false);
  
  // Points list created by teacher
  const [customPoints, setCustomPoints] = useState<Point2D[]>([
    { x: 3, y: -2, id: "1" },
    { x: -4, y: 5, id: "2" },
    { x: 0, y: -6, id: "3" },
    { x: -5, y: -4, id: "4" }
  ]);

  const gridRef = useRef<SVGSVGElement>(null);

  // Generate a random point based on quadrant restrictions
  const generateRandomPoint = () => {
    let x = 0;
    let y = 0;
    if (quadrants === "quad1") {
      x = Math.floor(Math.random() * gridSize) + 1;
      y = Math.floor(Math.random() * gridSize) + 1;
    } else {
      // Range: -gridSize to gridSize (excluding 0 for clarity, or including)
      x = Math.floor(Math.random() * (gridSize * 2 + 1)) - gridSize;
      y = Math.floor(Math.random() * (gridSize * 2 + 1)) - gridSize;
    }
    const newPt = { x, y, id: Date.now().toString() };
    setTargetPoint(newPt);
    setStudentPlotted(null);
    setInputX("");
    setInputY("");
    setShowHint(false);
    setFeedback({ message: mode === "plot" ? `Plot the point: (${x}, ${y})` : "Identify the coordinates of the plotted orange point!", type: "info" });
  };

  useEffect(() => {
    generateRandomPoint();
  }, [mode, quadrants, gridSize]);

  // Handle click on grid to plot a point (Student Mode: Plot the Point)
  const handleGridClick = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (mode !== "plot" || !gridRef.current) return;

    const svg = gridRef.current;
    const rect = svg.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert pixel coordinates to grid coordinate system
    // SVG viewBox is 0 0 400 400
    const svgWidth = 400;
    const svgHeight = 400;
    const padding = 40;
    const graphWidth = svgWidth - 2 * padding;
    const graphHeight = svgHeight - 2 * padding;

    // Relative to the grid region
    const relX = clickX - padding;
    const relY = clickY - padding;

    // Scale from pixel to grid [-gridSize, gridSize]
    const gridXFloat = ((relX / graphWidth) * 2 - 1) * gridSize;
    const gridYFloat = -(((relY / graphHeight) * 2 - 1) * gridSize); // inverted y in SVG

    // Snap to nearest integer
    const snappedX = Math.round(gridXFloat);
    const snappedY = Math.round(gridYFloat);

    // Bound check
    if (Math.abs(snappedX) <= gridSize && Math.abs(snappedY) <= gridSize) {
      const plotted = { x: snappedX, y: snappedY, id: "student" };
      setStudentPlotted(plotted);
      verifyPlot(snappedX, snappedY);
    }
  };

  const verifyPlot = (x: number, y: number) => {
    if (x === targetPoint.x && y === targetPoint.y) {
      setFeedback({
        message: `Perfect! You correctly plotted (${x}, ${y})! 🎉`,
        type: "success"
      });
    } else {
      // Swapped check
      if (x === targetPoint.y && y === targetPoint.x) {
        setFeedback({
          message: `Oops! You plotted (${x}, ${y}) but the point is (${targetPoint.x}, ${targetPoint.y}). Remember that the first coordinate x is HORIZONTAL and the second coordinate y is VERTICAL!`,
          type: "error"
        });
      } else {
        setFeedback({
          message: `Incorrect point plotted at (${x}, ${y}). Let's try again! Click anywhere on the grid or look at the hint!`,
          type: "error"
        });
      }
    }
  };

  const verifyIdentify = () => {
    const sX = parseInt(inputX);
    const sY = parseInt(inputY);

    if (isNaN(sX) || isNaN(sY)) {
      setFeedback({ message: "Please type in both coordinates!", type: "error" });
      return;
    }

    if (sX === targetPoint.x && sY === targetPoint.y) {
      setFeedback({
        message: `Awesome job! The coordinates are indeed (${sX}, ${sY}).`,
        type: "success"
      });
    } else {
      if (sX === targetPoint.y && sY === targetPoint.x) {
        setFeedback({
          message: `You typed (${sX}, ${sY}), which swaps the x and y axes. Remember: x is horizontal, y is vertical!`,
          type: "error"
        });
      } else {
        setFeedback({
          message: `Incorrect. (${sX}, ${sY}) is not the correct coordinates of the plotted point. Take another look!`,
          type: "error"
        });
      }
    }
  };

  // Convert grid value to SVG pixel coordinates
  const getSvgCoords = (x: number, y: number) => {
    const size = 400;
    const padding = 40;
    const graphSize = size - 2 * padding;

    // x mapping: [-gridSize, gridSize] -> [padding, size-padding]
    const svgX = padding + ((x / gridSize + 1) / 2) * graphSize;
    // y mapping: [-gridSize, gridSize] -> [size-padding, padding] (inverted)
    const svgY = padding + ((1 - y / gridSize) / 2) * graphSize;

    return { x: svgX, y: svgY };
  };

  // Grid SVG helper lines
  const renderGridLines = () => {
    const lines = [];
    const size = 400;
    const padding = 40;

    for (let i = -gridSize; i <= gridSize; i++) {
      if (i === 0) continue; // Axis is drawn separately

      const cPos = getSvgCoords(i, i);
      const startX = getSvgCoords(-gridSize, i).x;
      const endX = getSvgCoords(gridSize, i).x;
      const startY = getSvgCoords(i, -gridSize).y;
      const endY = getSvgCoords(i, gridSize).y;

      // Horizontal gridlines
      lines.push(
        <line
          key={`h-${i}`}
          x1={startX}
          y1={cPos.y}
          x2={endX}
          y2={cPos.y}
          stroke="#f1f5f9"
          strokeWidth="1"
        />
      );

      // Vertical gridlines
      lines.push(
        <line
          key={`v-${i}`}
          x1={cPos.x}
          y1={startY}
          x2={cPos.x}
          y2={endY}
          stroke="#f1f5f9"
          strokeWidth="1"
        />
      );

      // Grid coordinate labels along the axes
      const origin = getSvgCoords(0, 0);
      lines.push(
        <text
          key={`lbl-x-${i}`}
          x={cPos.x}
          y={origin.y + 14}
          textAnchor="middle"
          className="fill-slate-400 font-medium"
          style={{ fontSize: "9px" }}
        >
          {i}
        </text>
      );

      lines.push(
        <text
          key={`lbl-y-${i}`}
          x={origin.x - 10}
          y={cPos.y + 3.5}
          textAnchor="end"
          className="fill-slate-400 font-medium"
          style={{ fontSize: "9px" }}
        >
          {i}
        </text>
      );
    }
    return lines;
  };

  const origin = getSvgCoords(0, 0);
  const targetSvg = getSvgCoords(targetPoint.x, targetPoint.y);
  const studentSvg = studentPlotted ? getSvgCoords(studentPlotted.x, studentPlotted.y) : null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            🧭 Coordinate Grid Interactive
            <span className="text-xs px-2.5 py-1 rounded-full bg-sky-50 text-sky-600 font-semibold uppercase tracking-wider">
              Geometry & Graphs
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Master ordered pairs, axes, quadrants, and coordinates.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setMode("plot")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === "plot" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Mode 1: Plot the Point
          </button>
          <button
            onClick={() => setMode("identify")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              mode === "identify" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Mode 2: Identify Point
          </button>
        </div>
      </div>

      {/* Grid Settings Row */}
      <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Quadrants Shown
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setQuadrants("all")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                quadrants === "all" ? "bg-white border-indigo-600 text-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              All 4 Quadrants
            </button>
            <button
              onClick={() => setQuadrants("quad1")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                quadrants === "quad1" ? "bg-white border-indigo-600 text-indigo-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Quadrant I Only
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Grid Scale
          </label>
          <select
            value={gridSize}
            onChange={(e) => setGridSize(parseInt(e.target.value))}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
          >
            <option value={6}>Small (6 to -6)</option>
            <option value={10}>Standard (10 to -10)</option>
            <option value={15}>Large (15 to -15)</option>
          </select>
        </div>

        <div className="flex flex-col justify-end">
          <button
            onClick={generateRandomPoint}
            className="w-full py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-lg transition-all shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5"
          >
            <RefreshCw size={14} /> Next Random Point
          </button>
        </div>
      </div>

      {/* Main Layout (Graph on left, Controls on right) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
        {/* Left Column: Interactive Graph Canvas */}
        <div className="md:col-span-7 flex justify-center">
          <div className="relative bg-slate-50 p-4 border border-slate-100 rounded-2xl shadow-inner max-w-[380px] w-full">
            <svg
              ref={gridRef}
              viewBox="0 0 400 400"
              onClick={handleGridClick}
              className={`w-full h-auto select-none rounded-xl ${mode === "plot" ? "cursor-crosshair" : "cursor-default"}`}
            >
              {/* Grid lines helper */}
              {renderGridLines()}

              {/* Main Axes */}
              {/* Horizontal X Axis */}
              <line
                x1="20"
                y1={origin.y}
                x2="380"
                y2={origin.y}
                stroke="#64748b"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Arrow Heads for X Axis */}
              <polygon points={`380,${origin.y - 4} 388,${origin.y} 380,${origin.y + 4}`} fill="#64748b" />
              <polygon points={`20,${origin.y - 4} 12,${origin.y} 20,${origin.y + 4}`} fill="#64748b" />
              <text x="390" y={origin.y - 8} className="fill-slate-600 font-bold text-xs">x</text>

              {/* Vertical Y Axis */}
              <line
                x1={origin.x}
                y1="20"
                x2={origin.x}
                y2="380"
                stroke="#64748b"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Arrow Heads for Y Axis */}
              <polygon points={`${origin.x - 4},20 ${origin.x},12 ${origin.x + 4},20`} fill="#64748b" />
              <polygon points={`${origin.x - 4},380 ${origin.x},388 ${origin.x + 4},380`} fill="#64748b" />
              <text x={origin.x + 8} y="16" className="fill-slate-600 font-bold text-xs">y</text>

              {/* Origin dot */}
              <circle cx={origin.x} cy={origin.y} r="4" fill="#334155" />
              <text x={origin.x - 12} y={origin.y + 14} className="fill-slate-500 font-semibold" style={{ fontSize: "9px" }}>0</text>

              {/* Quadrant labels */}
              {quadrants === "all" && (
                <>
                  <text x="310" y="55" className="fill-slate-300 font-bold text-sm">Quad I (+,+)</text>
                  <text x="50" y="55" className="fill-slate-300 font-bold text-sm">Quad II (-,+)</text>
                  <text x="50" y="355" className="fill-slate-300 font-bold text-sm">Quad III (-,-)</text>
                  <text x="310" y="355" className="fill-slate-300 font-bold text-sm">Quad IV (+,-)</text>
                </>
              )}

              {/* MODE 1: Target text box overlay (only if in plot mode) */}
              {mode === "identify" && (
                /* Plotted target point dot */
                <g>
                  <circle cx={targetSvg.x} cy={targetSvg.y} r="7" className="fill-amber-500 stroke-white stroke-2 animate-pulse" />
                  <circle cx={targetSvg.x} cy={targetSvg.y} r="1.5" className="fill-white" />
                </g>
              )}

              {/* Student Plotted Point Indicator in Plot Mode */}
              {mode === "plot" && studentSvg && (
                <g>
                  <circle
                    cx={studentSvg.x}
                    cy={studentSvg.y}
                    r="7"
                    className={`stroke-white stroke-2 ${
                      studentPlotted?.x === targetPoint.x && studentPlotted?.y === targetPoint.y
                        ? "fill-green-500"
                        : "fill-red-500 animate-bounce"
                    }`}
                  />
                  <text x={studentSvg.x + 12} y={studentSvg.y - 10} className="fill-slate-700 font-bold text-xs bg-white px-1 rounded shadow-sm">
                    ({studentPlotted?.x}, {studentPlotted?.y})
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>

        {/* Right Column: Interaction Cards */}
        <div className="md:col-span-5 flex flex-col gap-4">
          {/* Target / Prompt Panel */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
            {mode === "plot" ? (
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Target Point</span>
                <div className="text-4xl font-extrabold text-slate-800 tracking-tight my-2">
                  ({targetPoint.x}, {targetPoint.y})
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Click on the correct grid intersection to plot this coordinates point.
                </p>
              </div>
            ) : (
              <div>
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Identify Coordinates</span>
                <p className="text-xs text-slate-500 my-1">
                  Type the ordered pair coordinates of the plotted <span className="text-amber-500 font-semibold">orange point</span>:
                </p>
                <div className="flex items-center gap-2 my-3">
                  <span className="text-2xl font-bold text-slate-400 font-mono">(</span>
                  <input
                    type="number"
                    placeholder="x"
                    value={inputX}
                    onChange={(e) => setInputX(e.target.value)}
                    className="w-16 px-2.5 py-2 text-center text-lg font-bold rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <span className="text-2xl font-bold text-slate-400 font-mono">,</span>
                  <input
                    type="number"
                    placeholder="y"
                    value={inputY}
                    onChange={(e) => setInputY(e.target.value)}
                    className="w-16 px-2.5 py-2 text-center text-lg font-bold rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <span className="text-2xl font-bold text-slate-400 font-mono">)</span>
                </div>
                <button
                  onClick={verifyIdentify}
                  className="w-full py-2.5 rounded-xl font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-md shadow-indigo-100 text-sm"
                >
                  Verify Coordinates
                </button>
              </div>
            )}
          </div>

          {/* Feedback & Hint Widget */}
          {feedback.message && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-2.5 ${
                feedback.type === "success"
                  ? "bg-green-50 border-green-200 text-green-800"
                  : feedback.type === "error"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-indigo-50 border-indigo-100 text-indigo-900"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs font-semibold leading-relaxed">
                {feedback.message}
              </div>
            </div>
          )}

          {/* Hint Trigger Button */}
          <div className="border border-slate-100 rounded-2xl p-4 bg-white shadow-sm">
            <button
              onClick={() => setShowHint(!showHint)}
              className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800"
            >
              <HelpCircle size={16} /> Need a Hint? Click Here
            </button>
            {showHint && (
              <div className="mt-2.5 text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                {mode === "plot" ? (
                  <>
                    <p className="font-semibold text-slate-700 mb-1">To plot ({targetPoint.x}, {targetPoint.y}):</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Start at the center origin <span className="font-bold text-slate-600">(0, 0)</span>.</li>
                      <li>Move <span className="font-bold text-indigo-600">{Math.abs(targetPoint.x)}</span> units {targetPoint.x >= 0 ? "RIGHT" : "LEFT"} along the horizontal x-axis.</li>
                      <li>Move <span className="font-bold text-sky-600">{Math.abs(targetPoint.y)}</span> units {targetPoint.y >= 0 ? "UP" : "DOWN"} parallel to the vertical y-axis.</li>
                    </ol>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-slate-700 mb-1">To read the orange point:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Look at how far left/right it is. This is the <strong>x-coordinate</strong> (first number).</li>
                      <li>Look at how far up/down it is. This is the <strong>y-coordinate</strong> (second number).</li>
                      <li>Write it in the box as <span className="font-bold text-indigo-600">(x, y)</span>.</li>
                    </ol>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}