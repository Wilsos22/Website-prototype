"use client";

import React, { useState } from "react";
import { Lock, Unlock, Plus, Trash2, Eye, EyeOff, CheckCircle2, RotateCcw, AlertCircle } from "lucide-react";

interface FractionBarItem {
  id: string;
  denominator: number;
  color: string;
  x: number;
  y: number;
  isLocked: boolean;
}

export default function FractionBars() {
  const [bars, setBars] = useState<FractionBarItem[]>([
    { id: "1", denominator: 1, color: "bg-red-500", x: 0, y: 0, isLocked: false },
    { id: "2", denominator: 2, color: "bg-orange-500", x: 0, y: 45, isLocked: false },
    { id: "3", denominator: 2, color: "bg-orange-500", x: 50, y: 45, isLocked: false },
  ]);

  const [teacherLock, setTeacherLock] = useState<boolean>(false);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<string>("Drag and stack bars to check if they are equivalent!");

  const denominators = [1, 2, 3, 4, 5, 6, 8, 10, 12];
  const colors: Record<number, string> = {
    1: "bg-red-500",
    2: "bg-orange-500",
    3: "bg-amber-500",
    4: "bg-yellow-500",
    5: "bg-green-500",
    6: "bg-teal-500",
    8: "bg-sky-500",
    10: "bg-indigo-500",
    12: "bg-purple-500"
  };

  const addBarGroup = (denom: number) => {
    // Generate a full set of fraction bars for that denominator
    const newBars: FractionBarItem[] = [];
    const color = colors[denom] || "bg-slate-500";
    const widthPercent = 100 / denom;

    const rowY = (denominators.indexOf(denom) * 35) + 30;

    for (let i = 0; i < denom; i++) {
      newBars.push({
        id: `${denom}-${i}-${Date.now()}`,
        denominator: denom,
        color,
        x: i * widthPercent,
        y: rowY,
        isLocked: false
      });
    }

    setBars([...bars, ...newBars]);
    setFeedback(`Added a full line of 1/${denom} fraction bars!`);
  };

  const clearCanvas = () => {
    setBars([]);
    setFeedback("Cleared the canvas! Add new bars using the selector.");
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    if (teacherLock) return;
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const container = e.currentTarget.getBoundingClientRect();
    
    // Calculate drop percentage position to maintain responsiveness
    const dropX = e.clientX - container.left;
    const dropY = e.clientY - container.top;
    
    let xPercent = (dropX / container.width) * 100;
    
    // Simple 5% snapping to help snap fraction bars together!
    const snapValue = 2.5;
    xPercent = Math.round(xPercent / snapValue) * snapValue;
    if (xPercent < 0) xPercent = 0;
    if (xPercent > 95) xPercent = 95;

    // Simple vertical snapping to standard row heights (intervals of 35px)
    const snappedY = Math.round(dropY / 35) * 35;

    setBars(bars.map(b => {
      if (b.id === id && !b.isLocked && !teacherLock) {
        return { ...b, x: xPercent, y: snappedY };
      }
      return b;
    }));

    setFeedback("Bars snapped together! Align endpoints to check for equivalency.");
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            🧱 Fraction Bars Lab
            <span className="text-xs px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 font-semibold uppercase tracking-wider">
              Fractions & Decimals
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Drag, stack, and align fraction strips to visually discover equivalent values.
          </p>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTeacherLock(!teacherLock)}
            className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all ${
              teacherLock
                ? "bg-amber-50 border-amber-300 text-amber-700 shadow-inner"
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm"
            }`}
            title="Lock all pieces on the board"
          >
            {teacherLock ? <Lock size={15} /> : <Unlock size={15} />}
            Teacher Lock Mode
          </button>
          <button
            onClick={() => setShowLabels(!showLabels)}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
          >
            {showLabels ? <EyeOff size={15} /> : <Eye size={15} />}
            {showLabels ? "Hide Labels" : "Show Labels"}
          </button>
          <button
            onClick={clearCanvas}
            className="p-2 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
          >
            <RotateCcw size={15} /> Reset Canvas
          </button>
        </div>
      </div>

      {/* Selector Palette */}
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6">
        <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
          Click to add fraction row to workspace:
        </label>
        <div className="flex flex-wrap gap-2">
          {denominators.map(denom => (
            <button
              key={denom}
              onClick={() => addBarGroup(denom)}
              className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all active:scale-95"
            >
              <Plus size={13} /> 1/{denom}
            </button>
          ))}
        </div>
      </div>

      {/* Main Drag-Drop Canvas */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 h-[360px] relative overflow-hidden p-4 shadow-inner"
      >
        {bars.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <AlertCircle size={32} className="text-slate-300" />
            <p className="text-sm font-semibold">Your Fraction Bars Canvas is empty.</p>
            <p className="text-xs text-slate-400">Add a fraction set from the selectors above to start exploring!</p>
          </div>
        ) : (
          bars.map(bar => {
            const widthPct = 100 / bar.denominator;
            return (
              <div
                key={bar.id}
                draggable={!teacherLock && !bar.isLocked}
                onDragStart={(e) => handleDragStart(e, bar.id)}
                style={{
                  left: `${bar.x}%`,
                  top: `${bar.y}px`,
                  width: `${widthPct}%`,
                  height: "30px"
                }}
                className={`absolute rounded-md shadow-sm border border-black/10 select-none cursor-move flex items-center justify-center transition-shadow active:shadow-md ${bar.color} text-white font-extrabold text-sm`}
              >
                {showLabels && (
                  <span>1/{bar.denominator}</span>
                )}
                
                {/* Trash button on individual pieces (only if hovered) */}
                <button
                  onClick={() => setBars(bars.filter(b => b.id !== bar.id))}
                  className="absolute right-1 p-0.5 rounded hover:bg-black/10 opacity-0 hover:opacity-100 transition-opacity"
                  title="Delete piece"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Interactive feedback bar */}
      <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100/40 rounded-xl flex items-center gap-2 text-xs font-semibold text-indigo-900 leading-relaxed">
        <CheckCircle2 size={16} className="text-indigo-600 shrink-0" />
        <span>{feedback}</span>
      </div>
    </div>
  );
}