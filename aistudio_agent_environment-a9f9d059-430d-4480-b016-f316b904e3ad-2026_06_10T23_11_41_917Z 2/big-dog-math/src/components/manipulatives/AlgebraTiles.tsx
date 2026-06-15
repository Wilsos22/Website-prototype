"use client";

import React, { useState } from "react";
import { Plus, Trash2, Eye, EyeOff, RotateCcw, AlertCircle, HelpCircle } from "lucide-react";

interface TileItem {
  id: string;
  type: "unit" | "x" | "x2";
  value: 1 | -1;
  color: string;
  width: number;
  height: number;
  x: number;
  y: number;
  label: string;
}

export default function AlgebraTiles() {
  const [tiles, setTiles] = useState<TileItem[]>([
    { id: "1", type: "x2", value: 1, color: "bg-blue-500", width: 90, height: 90, x: 40, y: 40, label: "+x²" },
    { id: "2", type: "x", value: 1, color: "bg-emerald-500", width: 30, height: 90, x: 160, y: 40, label: "+x" },
    { id: "3", type: "unit", value: 1, color: "bg-amber-400", width: 30, height: 30, x: 220, y: 40, label: "+1" },
    { id: "4", type: "unit", value: -1, color: "bg-rose-500", width: 30, height: 30, x: 220, y: 90, label: "-1" },
  ]);

  const [feedback, setFeedback] = useState<string>("Algebra Tiles loaded! Drag pieces onto the workspace or spawn new ones.");

  const spawnTile = (type: "unit" | "x" | "x2", val: 1 | -1) => {
    let color = "";
    let width = 30;
    let height = 30;
    let label = "";

    if (val === -1) {
      color = "bg-rose-500"; // Red is universally negative
    } else {
      color = type === "unit" ? "bg-amber-400" : type === "x" ? "bg-emerald-500" : "bg-blue-500";
    }

    if (type === "x2") {
      width = 90;
      height = 90;
      label = val === 1 ? "+x²" : "-x²";
    } else if (type === "x") {
      width = 30;
      height = 90;
      label = val === 1 ? "+x" : "-x";
    } else {
      width = 30;
      height = 30;
      label = val === 1 ? "+1" : "-1";
    }

    const newTile: TileItem = {
      id: `${type}-${val}-${Date.now()}`,
      type,
      value: val,
      color,
      width,
      height,
      x: 100 + Math.random() * 50,
      y: 100 + Math.random() * 50,
      label
    };

    setTiles([...tiles, newTile]);
    setFeedback(`Spawned ${label} algebra tile!`);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const container = e.currentTarget.getBoundingClientRect();
    
    const dropX = e.clientX - container.left;
    const dropY = e.clientY - container.top;

    // Grid snapping to 15px to line them up for area models!
    const snapValue = 15;
    const snappedX = Math.round(dropX / snapValue) * snapValue;
    const snappedY = Math.round(dropY / snapValue) * snapValue;

    setTiles(tiles.map(t => {
      if (t.id === id) {
        // Bound checks within drop area
        let finalX = snappedX - t.width / 2;
        let finalY = snappedY - t.height / 2;
        if (finalX < 0) finalX = 0;
        if (finalY < 0) finalY = 0;
        return { ...t, x: finalX, y: finalY };
      }
      return t;
    }));
  };

  // Expression Builder calculation
  const getExpressionString = (): string => {
    let x2Count = 0;
    let xCount = 0;
    let unitCount = 0;

    tiles.forEach(t => {
      if (t.type === "x2") x2Count += t.value;
      else if (t.type === "x") xCount += t.value;
      else unitCount += t.value;
    });

    const parts: string[] = [];

    if (x2Count !== 0) {
      parts.push(`${x2Count === 1 ? "" : x2Count === -1 ? "-" : x2Count}x²`);
    }

    if (xCount !== 0) {
      const sign = xCount > 0 && parts.length > 0 ? "+" : "";
      parts.push(`${sign}${xCount === 1 && parts.length > 0 ? "" : xCount === 1 ? "" : xCount === -1 ? "-" : xCount}x`);
    }

    if (unitCount !== 0) {
      const sign = unitCount > 0 && parts.length > 0 ? "+" : "";
      parts.push(`${sign}${unitCount}`);
    }

    if (parts.length === 0) return "0";
    return parts.join(" ").replace(/\+ -/g, "- ").replace(/\s+/g, " ");
  };

  const clearBoard = () => {
    setTiles([]);
    setFeedback("Cleared board! Ready to spawn a new equation model.");
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            🟩 Algebra Tiles Canvas
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-semibold uppercase tracking-wider">
              Visual Expressions
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Build variables, model equations, and compute area models with visual tiles.
          </p>
        </div>

        {/* Clear control */}
        <button
          onClick={clearBoard}
          className="p-2 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all"
        >
          <RotateCcw size={15} /> Clear Canvas
        </button>
      </div>

      {/* Spawner controls */}
      <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Unit Spawners */}
        <div>
          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2 text-center sm:text-left">
            Spawn Unit Tiles
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => spawnTile("unit", 1)}
              className="flex-1 py-2 text-xs font-bold text-slate-800 bg-amber-300 hover:bg-amber-400 rounded-lg shadow-sm text-center"
            >
              +1 Tile
            </button>
            <button
              onClick={() => spawnTile("unit", -1)}
              className="flex-1 py-2 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-lg shadow-sm text-center"
            >
              -1 Tile
            </button>
          </div>
        </div>

        {/* X Spawners */}
        <div>
          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2 text-center sm:text-left">
            Spawn X Tiles
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => spawnTile("x", 1)}
              className="flex-1 py-2 text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-sm text-center"
            >
              +x Tile
            </button>
            <button
              onClick={() => spawnTile("x", -1)}
              className="flex-1 py-2 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-lg shadow-sm text-center"
            >
              -x Tile
            </button>
          </div>
        </div>

        {/* X² Spawners */}
        <div>
          <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2 text-center sm:text-left">
            Spawn X² Tiles
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => spawnTile("x2", 1)}
              className="flex-1 py-2 text-xs font-bold text-white bg-blue-500 hover:bg-blue-600 rounded-lg shadow-sm text-center"
            >
              +x² Tile
            </button>
            <button
              onClick={() => spawnTile("x2", -1)}
              className="flex-1 py-2 text-xs font-bold text-white bg-rose-500 hover:bg-rose-600 rounded-lg shadow-sm text-center"
            >
              -x² Tile
            </button>
          </div>
        </div>
      </div>

      {/* Expression Builder HUD */}
      <div className="bg-indigo-900 text-white rounded-xl p-4 mb-6 flex justify-between items-center shadow-md">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-200">Expression Builder (Live Model)</span>
          <div className="text-2xl font-extrabold font-mono mt-0.5 tracking-wide">
            {getExpressionString()}
          </div>
        </div>
        <div className="text-xs text-indigo-200 font-medium max-w-xs text-right hidden sm:block">
          The algebra tile board calculates your equation in real-time. Spawn negative and positive blocks to solve!
        </div>
      </div>

      {/* Main Sandbox Drag Drop Canvas */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 h-[380px] relative overflow-hidden p-4 shadow-inner"
      >
        {tiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
            <AlertCircle size={32} className="text-slate-300" />
            <p className="text-sm font-semibold">Workspace is empty.</p>
            <p className="text-xs text-slate-400">Click any of the spawners above to add algebra tiles!</p>
          </div>
        ) : (
          tiles.map(tile => (
            <div
              key={tile.id}
              draggable
              onDragStart={(e) => handleDragStart(e, tile.id)}
              style={{
                left: `${tile.x}px`,
                top: `${tile.y}px`,
                width: `${tile.width}px`,
                height: `${tile.height}px`
              }}
              className={`absolute rounded-lg shadow border border-black/10 select-none cursor-move flex items-center justify-center transition-shadow active:shadow-md ${tile.color} text-white font-extrabold text-sm`}
            >
              <span>{tile.label}</span>

              {/* Delete individual tile (only visible on hover) */}
              <button
                onClick={() => setTiles(tiles.filter(t => t.id !== tile.id))}
                className="absolute top-1 right-1 p-0.5 rounded bg-black/15 hover:bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
                title="Remove tile"
              >
                <Trash2 size={9} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Interactive board guide */}
      <div className="mt-4 p-3.5 bg-indigo-50 border border-indigo-100/40 rounded-xl flex items-center gap-2.5 text-xs font-semibold text-indigo-950 leading-relaxed">
        <HelpCircle size={16} className="text-indigo-600 shrink-0" />
        <span><strong>Pro Tip:</strong> Place negative tiles next to positive tiles of the same size to represent "Zero Pairs" that cancel each other out! Grid snapping helps you align tiles neatly.</span>
      </div>
    </div>
  );
}