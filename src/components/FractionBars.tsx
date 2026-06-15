import React, { useState } from "react";

interface FractionRow {
  id: string;
  denominator: number;
  coloredSegments: boolean[]; // tracks which segments are highlighted
}

export default function FractionBars() {
  const [rows, setRows] = useState<FractionRow[]>([
    { id: "1", denominator: 1, coloredSegments: [true] },
    { id: "2", denominator: 2, coloredSegments: [true, false] },
    { id: "3", denominator: 4, coloredSegments: [true, true, false, false] }
  ]);
  const [selectedDenominator, setSelectedDenominator] = useState<number>(3);
  const [showAbbieModal, setShowAbbieModal] = useState<boolean>(false);

  const handleAddRow = () => {
    const newRow: FractionRow = {
      id: `row-${Date.now()}`,
      denominator: selectedDenominator,
      coloredSegments: Array(selectedDenominator).fill(false)
    };
    setRows([...rows, newRow]);
  };

  const handleToggleSegment = (rowId: string, segmentIndex: number) => {
    setRows(
      rows.map((r) => {
        if (r.id === rowId) {
          const nextColored = [...r.coloredSegments];
          nextColored[segmentIndex] = !nextColored[segmentIndex];
          return { ...r, coloredSegments: nextColored };
        }
        return r;
      })
    );
  };

  const handleDeleteRow = (id: string) => {
    setRows(rows.filter((r) => r.id !== id));
  };

  const handleReset = () => {
    setRows([
      { id: "1", denominator: 1, coloredSegments: [true] },
      { id: "2", denominator: 2, coloredSegments: [true, false] },
      { id: "3", denominator: 4, coloredSegments: [true, true, false, false] }
    ]);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-start font-sans relative">
      
      {/* Abbie Interactive Video Modal Popup */}
      {showAbbieModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl animate-scale-up">
            
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-rose-400">🎬</span>
                <span className="font-bold text-sm text-slate-200">Abbie's Fraction Visual Tutor</span>
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
                src="/abbie-hint-fractions.mp4"
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
              <p className="text-xs text-rose-200 leading-normal">
                <span className="font-bold block text-pink-400">Equivalent Fractions Guide:</span>
                "Notice how two of the 1/4 segments line up perfectly with one 1/2 segment? That means 2/4 is equal to 1/2! Try coloring the segments on your bars to find more matches!"
              </p>
            </div>

          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="w-full max-w-4xl flex flex-col sm:flex-row justify-between items-center border-b border-slate-800 pb-5 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <span className="text-rose-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5a2 2 0 10-2 2h2zm0 0h4" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold">Fraction Bars Playground</h1>
            <p className="text-xs text-slate-400">Explore visual equivalence, segment coloring, and fractions side-by-side.</p>
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
        
        {/* Left Spawner sidebar */}
        <div className="md:col-span-1 bg-slate-800 border border-slate-700 p-4 rounded-2xl shadow-md flex flex-col gap-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">🛠️ Add Fraction Bar</h3>
          
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-400 font-semibold block">Select Denominator:</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((num) => (
                <button
                  key={num}
                  onClick={() => setSelectedDenominator(num)}
                  className={`py-1.5 rounded-lg text-xs border font-mono transition ${
                    selectedDenominator === num
                      ? "bg-rose-600/30 border-rose-500 text-rose-300 font-bold"
                      : "bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300"
                  }`}
                >
                  1/{num}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleAddRow}
            className="bg-rose-600 hover:bg-rose-500 text-xs font-bold py-2 px-4 rounded-xl border border-rose-500 shadow transition w-full"
          >
            Add Fraction Bar Row
          </button>

          <button
            onClick={handleReset}
            className="bg-slate-900 hover:bg-slate-800 text-xs font-bold border border-slate-800 py-2 rounded-xl transition w-full mt-2 text-slate-400"
          >
            Reset Workspace
          </button>
        </div>

        {/* Right Bars Canvas workspace */}
        <div className="md:col-span-3 bg-slate-800/80 border border-slate-700 p-6 rounded-3xl shadow-xl flex flex-col justify-between gap-6 min-h-[400px]">
          
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">🍫 Active Fraction Workspace</span>
            <span className="text-[10px] text-slate-500">Click segments to color and compare proportions.</span>
          </div>

          <div className="flex flex-col gap-4 w-full py-4">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-3 bg-slate-950/45 border border-slate-900 p-3 rounded-2xl relative group">
                
                {/* Denominator Indicator */}
                <div className="w-12 text-center text-xs font-bold font-mono text-rose-300 flex-shrink-0">
                  {row.denominator === 1 ? "1 Whole" : `1/${row.denominator}`}
                </div>

                {/* Fraction Bar segment row */}
                <div className="flex-1 h-10 border border-slate-800 rounded-xl overflow-hidden flex select-none">
                  {row.coloredSegments.map((colored, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleToggleSegment(row.id, idx)}
                      className={`flex-1 h-full border-r border-slate-800/30 last:border-0 cursor-pointer transition-all duration-200 flex items-center justify-center font-mono text-[10px] ${
                        colored
                          ? "bg-rose-600 text-white font-extrabold shadow-inner"
                          : "bg-slate-900/60 hover:bg-slate-800/60 text-slate-500"
                      }`}
                    >
                      {row.denominator === 1 ? "1" : `1/${row.denominator}`}
                    </div>
                  ))}
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDeleteRow(row.id)}
                  title="Remove row"
                  className="bg-slate-900 hover:bg-rose-950 border border-slate-800 hover:border-rose-800 hover:text-rose-400 p-1.5 rounded-xl text-slate-500 transition opacity-0 group-hover:opacity-100 flex-shrink-0"
                >
                  ✕
                </button>

              </div>
            ))}

            {rows.length === 0 && (
              <div className="text-slate-500 italic py-12 text-center text-sm">
                No active rows! Select a denominator in the sidebar to add fraction bars.
              </div>
            )}
          </div>

          <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700 text-[10px] text-slate-400">
            💡 <span className="font-bold text-slate-300">Pro-Tip:</span> Compare bars vertically to analyze equivalence! For example, line up 1/2 with 2/4, 3/6, or 4/8 to see they represent the same total region size.
          </div>

        </div>

      </div>

    </div>
  );
}
