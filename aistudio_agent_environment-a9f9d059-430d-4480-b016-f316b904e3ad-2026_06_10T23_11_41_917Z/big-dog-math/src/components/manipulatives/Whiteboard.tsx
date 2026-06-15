"use client";

import React, { useRef, useState, useEffect } from "react";
import { PenTool, Eraser, RotateCcw, Download, CheckCircle2, Paintbrush } from "lucide-react";

export default function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [color, setColor] = useState<string>("#334155"); // slate-700
  const [lineWidth, setLineWidth] = useState<number>(4);
  const [mode, setMode] = useState<"draw" | "erase">("draw");
  const [feedback, setFeedback] = useState<string>("Whiteboard canvas initialized. Draw or model diagrams!");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = canvas.parentElement?.clientWidth || 800;
    canvas.height = 360;

    // Set background color
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Context drawing styles
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = mode === "erase" ? "#ffffff" : color;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setFeedback("Cleared whiteboard canvas!");
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = "big-dog-math-whiteboard.png";
    link.href = url;
    link.click();
    setFeedback("Whiteboard image downloaded successfully!");
  };

  // Color palette items
  const colors = [
    { value: "#334155", label: "Charcoal" },
    { value: "#4f46e5", label: "Indigo" },
    { value: "#0284c7", label: "Sky" },
    { value: "#10b981", label: "Emerald" },
    { value: "#f43f5e", label: "Rose" },
    { value: "#f59e0b", label: "Amber" }
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            🎨 Interactive Whiteboard
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 font-semibold uppercase tracking-wider">
              Scratchpad
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Draw custom math diagrams, solve formulas, or explain equations with pen/eraser controls.
          </p>
        </div>

        {/* Clear/Download controls */}
        <div className="flex gap-2">
          <button
            onClick={downloadCanvas}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
          >
            <Download size={15} /> Save Screenshot
          </button>
          <button
            onClick={clearCanvas}
            className="p-2 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
          >
            <RotateCcw size={15} /> Clear Canvas
          </button>
        </div>
      </div>

      {/* Main Toolbar */}
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
        {/* Draw vs Erase */}
        <div>
          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
            Tool Select
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setMode("draw")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                mode === "draw"
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <PenTool size={14} /> Draw Pen
            </button>
            <button
              onClick={() => setMode("erase")}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                mode === "erase"
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              <Eraser size={14} /> Eraser
            </button>
          </div>
        </div>

        {/* Brush Size */}
        <div>
          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
            Pen Thickness ({lineWidth}px)
          </label>
          <input
            type="range"
            min="2"
            max="20"
            step="1"
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="w-full accent-indigo-600"
          />
        </div>

        {/* Color Palette */}
        <div>
          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
            Ink Color
          </label>
          <div className="flex justify-between items-center bg-white border border-slate-200 rounded-lg p-1.5">
            {colors.map(c => (
              <button
                key={c.value}
                onClick={() => { setColor(c.value); setMode("draw"); }}
                style={{ backgroundColor: c.value }}
                className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                  color === c.value && mode === "draw" ? "border-slate-800 scale-105" : "border-transparent"
                }`}
                title={c.label}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Drawing Canvas */}
      <div className="border border-slate-200 rounded-2xl bg-white shadow-inner overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="w-full h-[360px] cursor-crosshair bg-white"
        />
      </div>

      {/* Canvas feedback alert bar */}
      <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100/40 rounded-xl flex items-center gap-2 text-xs font-semibold text-indigo-900 leading-relaxed">
        <Paintbrush size={15} className="text-indigo-600 shrink-0" />
        <span>{feedback}</span>
      </div>
    </div>
  );
}