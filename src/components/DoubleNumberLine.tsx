import React, { useState, useRef, useEffect } from "react";

interface PresetScale {
  name: string;
  lineALabel: string;
  lineBLabel: string;
  lineAMax: number;
  lineBMax: number;
  lineAUnit: string;
  lineBUnit: string;
}

export default function DoubleNumberLine() {
  const presets: PresetScale[] = [
    {
      name: "🚗 Speed (Distance vs Time)",
      lineALabel: "Distance",
      lineBLabel: "Time",
      lineAMax: 120,
      lineBMax: 2,
      lineAUnit: "miles",
      lineBUnit: "hours",
    },
    {
      name: "📊 Percentage (Score vs Total)",
      lineALabel: "Score",
      lineBLabel: "Percentage",
      lineAMax: 40,
      lineBMax: 100,
      lineAUnit: "points",
      lineBUnit: "%",
    },
    {
      name: "🥣 Cooking (Flour vs Sugar)",
      lineALabel: "Cups of Flour",
      lineBLabel: "Cups of Sugar",
      lineAMax: 6,
      lineBMax: 1.5,
      lineAUnit: "cups",
      lineBUnit: "cups",
    },
    {
      name: "💶 Exchange Rate (USD vs EUR)",
      lineALabel: "USD",
      lineBLabel: "EUR",
      lineAMax: 100,
      lineBMax: 92,
      lineAUnit: "$",
      lineBUnit: "€",
    }
  ];

  const [activePreset, setActivePreset] = useState<number>(0);
  const [lineALabel, setLineALabel] = useState(presets[0].lineALabel);
  const [lineBLabel, setLineBLabel] = useState(presets[0].lineBLabel);
  const [lineAMax, setLineAMax] = useState(presets[0].lineAMax);
  const [lineBMax, setLineBMax] = useState(presets[0].lineBMax);
  const [lineAUnit, setLineAUnit] = useState(presets[0].lineAUnit);
  const [lineBUnit, setLineBUnit] = useState(presets[0].lineBUnit);

  // Position of crossbar from 0.0 to 1.0 (percent)
  const [crossbarRatio, setCrossbarRatio] = useState<number>(0.5);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activePreset !== -1) {
      const p = presets[activePreset];
      setLineALabel(p.lineALabel);
      setLineBLabel(p.lineBLabel);
      setLineAMax(p.lineAMax);
      setLineBMax(p.lineBMax);
      setLineAUnit(p.lineAUnit);
      setLineBUnit(p.lineBUnit);
    }
  }, [activePreset]);

  // Handle pointer down, move, and up
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateCrossbarPosition(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    updateCrossbarPosition(e);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const updateCrossbarPosition = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    setCrossbarRatio(pct);
  };

  // Live computed values
  const currentValA = (crossbarRatio * lineAMax).toFixed(1);
  const currentValB = (crossbarRatio * lineBMax).toFixed(2);

  // Helper to draw ticks on the line
  const tickCount = 10;
  const tickElements = [];
  for (let i = 0; i <= tickCount; i++) {
    tickElements.push(i / tickCount);
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-start font-sans">
      
      {/* Header */}
      <div className="w-full max-w-4xl flex flex-col sm:flex-row justify-between items-center border-b border-slate-800 pb-5 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <span className="text-cyan-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold">Interactive Double Number Line</h1>
            <p className="text-xs text-slate-400">Visualize ratios, equivalent rates, and proportions. Drag the vertical crossbar to view live computed matches.</p>
          </div>
        </div>

        {/* Coach Mascot */}
        <div className="flex items-center gap-3 bg-indigo-950/40 border border-indigo-800 p-2.5 rounded-xl max-w-sm">
          <img
            src="/abbie-celebrating.png"
            alt="Abbie Mascot"
            className="w-10 h-10 object-contain bg-white/10 rounded-full p-0.5 flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://placekitten.com/60/60";
            }}
          />
          <div className="text-xs text-indigo-200">
            <span className="font-bold text-pink-400 block">Abbie Says:</span>\n            \"No matter how far you drag the bar, the ratio between the top and bottom values stays the same!\"\n          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Preset Side Selector & Custom Bounds Editor */}
        <div className="md:col-span-1 flex flex-col gap-5">
          <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-md">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">📋 Choose a Rate Preset</h3>
            <div className="flex flex-col gap-2">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setActivePreset(idx)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs border transition-all ${
                    activePreset === idx
                      ? "bg-cyan-600/20 border-cyan-500 text-white font-semibold"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {p.name}
                </button>
              ))}
              <button
                onClick={() => setActivePreset(-1)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs border transition-all ${
                  activePreset === -1
                    ? "bg-cyan-600/20 border-cyan-500 text-white font-semibold"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                ⚙️ Custom Scale
              </button>
            </div>
          </div>

          {/* Custom Bounds form */}
          {activePreset === -1 && (
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-md flex flex-col gap-3 animate-fade-in">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Configure Custom Scale</h3>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Top Line (Line A) Label & Max</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={lineALabel}
                    onChange={(e) => setLineALabel(e.target.value)}
                    placeholder="Label A"
                    className="w-1/2 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs focus:outline-none"
                  />
                  <input
                    type="number"
                    value={lineAMax}
                    onChange={(e) => setLineAMax(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="w-1/2 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs focus:outline-none text-center"
                  />
                </div>
                <input
                  type="text"
                  value={lineAUnit}
                  onChange={(e) => setLineAUnit(e.target.value)}
                  placeholder="Unit A (e.g. miles)"
                  className="w-full bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs focus:outline-none mt-1"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Bottom Line (Line B) Label & Max</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={lineBLabel}
                    onChange={(e) => setLineBLabel(e.target.value)}
                    placeholder="Label B"
                    className="w-1/2 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs focus:outline-none"
                  />
                  <input
                    type="number"
                    value={lineBMax}
                    onChange={(e) => setLineBMax(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="w-1/2 bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs focus:outline-none text-center"
                  />
                </div>
                <input
                  type="text"
                  value={lineBUnit}
                  onChange={(e) => setLineBUnit(e.target.value)}
                  placeholder="Unit B (e.g. hours)"
                  className="w-full bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs focus:outline-none mt-1"
                />
              </div>
            </div>
          )}
        </div>

        {/* Double Line Canvas area */}
        <div className="md:col-span-3 bg-slate-800/80 border border-slate-700 p-6 rounded-3xl shadow-xl flex flex-col justify-between gap-6 relative overflow-hidden">
          
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Equivalent Rates Visualizer</span>
            <span className="bg-cyan-950 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full">
              Proportion: {(crossbarRatio * 100).toFixed(0)}%
            </span>
          </div>

          {/* Lines Sandbox */}
          <div 
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="w-full h-56 bg-slate-950 rounded-2xl border border-slate-800 relative select-none touch-none cursor-ew-resize flex flex-col justify-around py-6 overflow-visible"
          >
            {/* Top Line A */}
            <div className="w-full h-1 bg-cyan-500/40 relative">
              {/* Ticks */}
              {tickElements.map((tick, i) => (
                <div 
                  key={`tickA-${i}`} 
                  style={{ left: `${tick * 100}%` }}
                  className="absolute w-0.5 h-3.5 bg-cyan-400 -top-1.5 transform -translate-x-1/2 flex flex-col items-center justify-start"
                >
                  <span className="text-[10px] text-slate-400 mt-4 font-mono font-semibold">
                    {(tick * lineAMax).toFixed(0)}
                  </span>
                </div>
              ))}
              <div className="absolute left-3 -top-7 text-xs font-bold text-cyan-300">
                {lineALabel} ({lineAUnit})
              </div>
            </div>

            {/* Bottom Line B */}
            <div className="w-full h-1 bg-indigo-500/40 relative">
              {/* Ticks */}
              {tickElements.map((tick, i) => (
                <div 
                  key={`tickB-${i}`} 
                  style={{ left: `${tick * 100}%` }}
                  className="absolute w-0.5 h-3.5 bg-indigo-400 -top-1.5 transform -translate-x-1/2 flex flex-col items-center justify-end"
                >
                  <span className="text-[10px] text-slate-400 mb-4 bottom-1 absolute font-mono font-semibold">
                    {(tick * lineBMax).toFixed(1)}
                  </span>
                </div>
              ))}
              <div className="absolute left-3 top-4 text-xs font-bold text-indigo-300">
                {lineBLabel} ({lineBUnit})
              </div>
            </div>

            {/* Vertical Draggable Crossbar Slider */}
            <div 
              style={{ left: `${crossbarRatio * 100}%` }}
              className="absolute top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 via-pink-400 to-indigo-400 z-10 pointer-events-none transform -translate-x-1/2"
            >
              {/* Sliding handle */}
              <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-pink-500 border-2 border-white shadow-md flex items-center justify-center animate-pulse">
                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
              </div>

              {/* Live Floating Indicator (Tooltip) */}
              <div className="absolute top-[-36px] left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-cyan-500 to-indigo-500 px-3 py-1 rounded-lg shadow-xl text-center whitespace-nowrap border border-white/20 z-20 flex flex-col items-center">
                <span className="text-white text-xs font-black tracking-wide">
                  {currentValA} {lineAUnit}
                </span>
                <span className="text-[9px] text-white/90 font-bold mt-0.5">
                  {currentValB} {lineBUnit}
                </span>
                {/* little triangle pointer */}
                <div className="w-2 h-2 bg-indigo-500 rotate-45 transform translate-y-1.5 absolute bottom-0.5"></div>
              </div>
            </div>

          </div>

          {/* Equivalence analysis box */}
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div>\n              <h4 className="text-sm font-bold text-cyan-300">✨ Proportional Equivalence</h4>\n              <p className="text-xs text-slate-400">\n                The ratio remains constant: {currentValA} / {currentValB} is equivalent to {lineAMax} / {lineBMax}.\n              </p>\n            </div>
            <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-center flex-shrink-0 min-w-[130px]">
              <span className="text-[10px] text-slate-500 uppercase block tracking-wider font-bold">Unit Rate</span>
              <span className="text-base font-black text-emerald-400">
                {(lineAMax / lineBMax).toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                {lineAUnit} per {lineBUnit}
              </span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
