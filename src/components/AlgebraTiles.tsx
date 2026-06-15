import React, { useState } from "react";

interface Tile {
  id: string;
  type: "x2" | "x" | "constant";
  value: 1 | -1;
  x: number;
  y: number;
  isDragging?: boolean;
}

export default function AlgebraTiles() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [teacherInput, setTeacherInput] = useState<string>("2x^2 - 3x + 4");
  const [showAbbieModal, setShowAbbieModal] = useState<boolean>(false);
  
  // Track dragging variables
  const [dragInfo, setDragInfo] = useState<{ id: string; startX: number; startY: number } | null>(null);

  // Parse Formula and spawn corresponding tiles
  const handleParseFormula = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherInput.trim()) return;

    const cleanStr = teacherInput.replace(/\s+/g, "");
    const regex = /([+-]?\d*(?:x\^2|x)?)/g;
    const matches = cleanStr.match(regex);
    if (!matches) return;

    const spawnedTiles: Tile[] = [];
    let startX = 40;
    let startY = 40;

    matches.forEach((term, index) => {
      if (!term) return;

      // Check type
      let type: "x2" | "x" | "constant" = "constant";
      if (term.includes("x^2")) {
        type = "x2";
      } else if (term.includes("x")) {
        type = "x";
      }

      // Check sign & coefficient
      let value: 1 | -1 = 1;
      let coeff = 1;

      let coeffStr = term.replace("x^2", "").replace("x", "");
      if (coeffStr === "" || coeffStr === "+") {
        coeff = 1;
      } else if (coeffStr === "-") {
        coeff = 1;
        value = -1;
      } else {
        const num = parseInt(coeffStr);
        coeff = Math.abs(num);
        value = num < 0 ? -1 : 1;
      }

      // Spawn 'coeff' number of tiles
      for (let i = 0; i < coeff; i++) {
        spawnedTiles.push({
          id: `tile-${Date.now()}-${index}-${i}`,
          type,
          value,
          x: startX + (i * 45) % 150,
          y: startY + Math.floor((i * 45) / 150) * 45
        });
      }

      // shift spacing
      startX += 110;
      if (startX > 320) {
        startX = 40;
        startY += 90;
      }
    });

    setTiles(spawnedTiles);
  };

  // Add individual manual tile spawner
  const handleAddManualTile = (type: "x2" | "x" | "constant", value: 1 | -1) => {
    const newTile: Tile = {
      id: `manual-tile-${Date.now()}`,
      type,
      value,
      x: 100 + Math.random() * 80,
      y: 100 + Math.random() * 80
    };
    setTiles((prev) => [...prev, newTile]);
  };

  // Pointer Event-based Lightweight Drag Mechanics
  const handlePointerDown = (tileId: string, e: React.PointerEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setDragInfo({
      id: tileId,
      startX: x,
      startY: y
    });

    setTiles((prev) =>
      prev.map((t) => (t.id === tileId ? { ...t, isDragging: true } : t))
    );
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragInfo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setTiles((prev) =>
      prev.map((t) => {
        if (t.id === dragInfo.id) {
          return { 
            ...t, 
            x: Math.max(10, Math.min(rect.width - 60, x)), 
            y: Math.max(10, Math.min(rect.height - 60, y)) 
          };
        }
        return t;
      })
    );
  };

  const handlePointerUp = () => {
    if (!dragInfo) return;
    setTiles((prev) =>
      prev.map((t) => (t.id === dragInfo.id ? { ...t, isDragging: false } : t))
    );
    setDragInfo(null);
  };

  // Proximity cancellation check: return pair indices if a positive and a negative tiles align
  const getZeroPairs = (): [string, string][] => {
    const pairs: [string, string][] = [];
    const usedIds = new Set<string>();

    for (let i = 0; i < tiles.length; i++) {
      const first = tiles[i];
      if (usedIds.has(first.id)) continue;

      for (let j = i + 1; j < tiles.length; j++) {
        const second = tiles[j];
        if (usedIds.has(second.id)) continue;

        if (first.type === second.type && first.value !== second.value) {
          const dx = first.x - second.x;
          const dy = first.y - second.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // If close enough (65px)
          if (dist < 65) {
            pairs.push([first.id, second.id]);
            usedIds.add(first.id);
            usedIds.add(second.id);
            break;
          }
        }
      }
    }

    return pairs;
  };

  const activePairs = getZeroPairs();
  const pairedIds = new Set<string>(activePairs.flat());

  // Delete/Zap all connected Zero pairs
  const handleZapPairs = () => {
    const idsToZap = new Set<string>(activePairs.flat());
    setTiles((prev) => prev.filter((t) => !idsToZap.has(t.id)));
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-start font-sans relative">
      
      {/* Abbie Video Guide Modal */}
      {showAbbieModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">🧱</span>
                <span className="font-bold text-sm text-slate-200">Abbie's Algebra Tiles Visualizer Guide</span>
              </div>
              <button
                onClick={() => setShowAbbieModal(false)}
                className="text-slate-400 hover:text-white bg-slate-800 px-3 py-1 rounded-xl text-xs transition"
              >
                Close Video
              </button>
            </div>

            {/* Video Player */}
            <div className="aspect-video bg-black relative">
              <video
                src="/abbie-hint-algebra.mp4"
                controls
                autoPlay
                className="w-full h-full object-contain"
                onError={(e) => {
                  console.log("No video asset found. Mock active.");
                }}
              />
            </div>

            {/* Modal Footer context message */}
            <div className="p-5 bg-slate-950 border-t border-slate-800 flex items-center gap-4">
              <img
                src="/abbie-celebrating.png"
                alt="Coach Abbie"
                className="w-12 h-12 object-contain bg-white/10 rounded-full p-1"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://placekitten.com/60/60";
                }}
              />
              <p className="text-xs text-emerald-200 leading-normal">
                <span className="font-bold block text-pink-400">Understanding Zero Pairs:</span>
                "When a positive tile and a negative tile of the identical size meet, they cancel each other out to make zero! Push them together until the red border and '0' badge appear, then click Zap Pairs to clear them!"
              </p>
            </div>

          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="w-full max-w-4xl flex flex-col sm:flex-row justify-between items-center border-b border-slate-800 pb-5 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <span className="text-emerald-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold">Interactive Algebra Tiles</h1>
            <p className="text-xs text-slate-400">Visualize polynomial formulas, drag matching shapes, and combine Zero Pairs.</p>
          </div>
        </div>

        {/* Ask Abbie Button */}
        <button
          onClick={() => setShowAbbieModal(true)}
          className="bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-400 hover:to-rose-500 text-xs font-bold px-4 py-2.5 rounded-xl border border-rose-400 shadow flex items-center gap-2 transition"
        >
          <img
            src="/abbie-celebrating.png"
            alt="Mascot Abbie button icon"
            className="w-5 h-5 object-contain bg-white/20 rounded-full"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://placekitten.com/40/40";
            }}
          />
          Ask Abbie! (Video Helper)
        </button>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Left Spawners/Inputs column */}
        <div className="md:col-span-1 flex flex-col gap-4">
          
          {/* Teacher formula box */}
          <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-md">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">✏️ Spawn Equation</h3>
            <form onSubmit={handleParseFormula} className="flex flex-col gap-2">
              <input
                type="text"
                value={teacherInput}
                onChange={(e) => setTeacherInput(e.target.value)}
                placeholder="e.g. 2x^2 - 3x + 4"
                className="bg-slate-900 border border-slate-700 px-3 py-2 rounded-xl text-xs font-mono focus:outline-none focus:border-emerald-500 text-center text-white"
              />
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-xs font-bold py-2 rounded-xl transition border border-emerald-500"
              >
                Spawn Formula Tiles
              </button>
            </form>
          </div>

          {/* Manual Tiles click spawner */}
          <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-md">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">🧱 Manual Spawner</h3>
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleAddManualTile("x2", 1)}
                  className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 py-1 rounded border border-blue-500/50 text-[10px] font-bold"
                >
                  + x² (Blue)
                </button>
                <button
                  onClick={() => handleAddManualTile("x2", -1)}
                  className="bg-red-600/20 hover:bg-red-600/30 text-red-300 py-1 rounded border border-red-500/50 text-[10px] font-bold"
                >
                  - x² (Red)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleAddManualTile("x", 1)}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 py-1 rounded border border-emerald-500/50 text-[10px] font-bold"
                >
                  + x (Green)
                </button>
                <button
                  onClick={() => handleAddManualTile("x", -1)}
                  className="bg-red-600/20 hover:bg-red-600/30 text-red-300 py-1 rounded border border-red-500/50 text-[10px] font-bold"
                >
                  - x (Red)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleAddManualTile("constant", 1)}
                  className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 py-1 rounded border border-amber-500/50 text-[10px] font-bold"
                >
                  + 1 (Orange)
                </button>
                <button
                  onClick={() => handleAddManualTile("constant", -1)}
                  className="bg-red-600/20 hover:bg-red-600/30 text-red-300 py-1 rounded border border-red-500/50 text-[10px] font-bold"
                >
                  - 1 (Red)
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => setTiles([])}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-800 py-2.5 rounded-xl text-xs font-bold text-slate-400 transition"
          >
            Clear Canvas
          </button>

        </div>

        {/* Right Canvas drawing space */}
        <div className="md:col-span-3 bg-slate-800/80 border border-slate-700 p-6 rounded-3xl shadow-xl flex flex-col justify-between gap-6 min-h-[450px]">
          
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">🎛️ Drag Canvas workspace</span>
            
            {/* Zap Zero pairs trigger */}
            {activePairs.length > 0 && (
              <button
                onClick={handleZapPairs}
                className="bg-red-600 hover:bg-red-500 text-white text-[10px] font-extrabold py-1 px-3 rounded-full animate-pulse flex items-center gap-1.5 border border-red-400"
              >
                💥 Zap {activePairs.length} Zero Pairs!
              </button>
            )}
          </div>

          {/* Interactive Workspace Sandbox */}
          <div
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="w-full flex-1 h-[320px] bg-slate-950 rounded-2xl border border-slate-800 relative select-none touch-none overflow-hidden"
          >
            {/* Draw Bounding Zero pair highlights */}
            {activePairs.map(([id1, id2], idx) => {
              const t1 = tiles.find(t => t.id === id1);
              const t2 = tiles.find(t => t.id === id2);
              if (!t1 || !t2) return null;

              // Calculate bounding box bounds
              const minX = Math.min(t1.x, t2.x) - 10;
              const minY = Math.min(t1.y, t2.y) - 10;
              const maxX = Math.max(t1.x + (t1.type === "x2" ? 60 : t1.type === "x" ? 35 : 25), t2.x + (t2.type === "x2" ? 60 : t2.type === "x" ? 35 : 25)) + 10;
              const maxY = Math.max(t1.y + (t1.type === "x2" ? 60 : t1.type === "x" ? 35 : 25), t2.y + (t2.type === "x2" ? 60 : t2.type === "x" ? 35 : 25)) + 10;

              return (
                <div
                  key={`pair-${idx}`}
                  style={{
                    left: `${minX}px`,
                    top: `${minY}px`,
                    width: `${maxX - minX}px`,
                    height: `${maxY - minY}px`
                  }}
                  className="absolute border-2 border-dashed border-red-500/80 bg-red-500/5 rounded-xl pointer-events-none flex items-center justify-center animate-pulse z-0"
                >
                  <span className="absolute -top-3.5 bg-red-600 text-white font-extrabold font-mono text-[9px] px-1.5 py-0.5 rounded-md shadow-md">
                    Zero Pair
                  </span>
                </div>
              );
            })}

            {/* Draggable Tiles rendering */}
            {tiles.map((tile) => {
              // Styling parameters
              let dimensions = "w-14 h-14";
              let baseColors = "";

              if (tile.type === "x2") {
                dimensions = "w-14 h-14";
                baseColors = tile.value === 1 ? "bg-blue-600 border-blue-400 text-white" : "bg-red-600 border-red-400 text-white";
              } else if (tile.type === "x") {
                dimensions = "w-8 h-14";
                baseColors = tile.value === 1 ? "bg-emerald-600 border-emerald-400 text-white" : "bg-red-600 border-red-400 text-white";
              } else {
                dimensions = "w-8 h-8";
                baseColors = tile.value === 1 ? "bg-amber-600 border-amber-400 text-white" : "bg-red-600 border-red-400 text-white";
              }

              const isPaired = pairedIds.has(tile.id);

              return (
                <div
                  key={tile.id}
                  onPointerDown={(e) => handlePointerDown(tile.id, e)}
                  style={{
                    left: `${tile.x}px`,
                    top: `${tile.y}px`
                  }}
                  className={`absolute ${dimensions} ${baseColors} border-2 rounded-xl flex items-center justify-center font-extrabold font-mono text-xs shadow-md cursor-grab active:cursor-grabbing select-none transition-transform duration-75 z-10 ${
                    tile.isDragging ? "ring-2 ring-white scale-105" : ""
                  } ${isPaired ? "ring-2 ring-red-500" : ""}`}
                >
                  {tile.type === "x2" ? (
                    <span>{tile.value === 1 ? "+x²" : "-x²"}</span>
                  ) : tile.type === "x" ? (
                    <span>{tile.value === 1 ? "+x" : "-x"}</span>
                  ) : (
                    <span>{tile.value === 1 ? "+1" : "-1"}</span>
                  )}
                </div>
              );
            })}

            {tiles.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-8 text-center text-xs italic">
                <span>Canvas empty!</span>
                <span className="mt-1">Enter a formula or click the manual spawner buttons to spawn your blocks.</span>
              </div>
            )}
          </div>

          <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700 text-[10px] text-slate-400">
            💡 <span className="font-bold text-slate-300">How to solve equations:</span> Enter standard form polynomials. Spawning will lay out positive vs negative blocks. Group opposing tiles together to trigger cancellation zero-pairs.
          </div>

        </div>

      </div>

    </div>
  );
}
