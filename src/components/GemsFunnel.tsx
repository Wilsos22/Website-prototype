import React, { useState, useEffect, useRef } from "react";

interface FunnelStep {
  expression: string;
  highlighted: string; // the part being evaluated
  operation: "G" | "E" | "M" | "S" | "Done";
  explanation: string;
}

export default function GemsFunnel() {
  const [expressionInput, setExpressionInput] = useState("");
  const [activePreset, setActivePreset] = useState<number>(0);
  const [steps, setSteps] = useState<FunnelStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Default presets
  const presets = [
    {
      name: "Preset 1",
      expr: "4 * (3 + 1)^2 - 10 / 2",
      steps: [
        {
          expression: "4 * (3 + 1)^2 - 10 / 2",
          highlighted: "(3 + 1)",
          operation: "G",
          explanation: "Evaluate the Grouping symbol first: (3 + 1) = 4."
        },
        {
          expression: "4 * 4^2 - 10 / 2",
          highlighted: "4^2",
          operation: "E",
          explanation: "Evaluate the Exponent: 4^2 = 16."
        },
        {
          expression: "4 * 16 - 10 / 2",
          highlighted: "4 * 16",
          operation: "M",
          explanation: "Perform Multiplication/Division from left to right: 4 * 16 = 64."
        },
        {
          expression: "64 - 10 / 2",
          highlighted: "10 / 2",
          operation: "M",
          explanation: "Perform remaining Multiplication/Division: 10 / 2 = 5."
        },
        {
          expression: "64 - 5",
          highlighted: "64 - 5",
          operation: "S",
          explanation: "Finally, perform Subtraction/Addition: 64 - 5 = 59."
        },
        {
          expression: "59",
          highlighted: "",
          operation: "Done",
          explanation: "All steps complete! The final simplified value is 59."
        }
      ] as FunnelStep[]
    },
    {
      name: "Preset 2",
      expr: "(6 + 2)^2 - 4 * 3 + 5",
      steps: [
        {
          expression: "(6 + 2)^2 - 4 * 3 + 5",
          highlighted: "(6 + 2)",
          operation: "G",
          explanation: "Evaluate grouping symbol: (6 + 2) = 8."
        },
        {
          expression: "8^2 - 4 * 3 + 5",
          highlighted: "8^2",
          operation: "E",
          explanation: "Evaluate exponent: 8^2 = 64."
        },
        {
          expression: "64 - 4 * 3 + 5",
          highlighted: "4 * 3",
          operation: "M",
          explanation: "Multiply first: 4 * 3 = 12."
        },
        {
          expression: "64 - 12 + 5",
          highlighted: "64 - 12",
          operation: "S",
          explanation: "Subtract/Add from left to right: 64 - 12 = 52."
        },
        {
          expression: "52 + 5",
          highlighted: "52 + 5",
          operation: "S",
          explanation: "Add remaining: 52 + 5 = 57."
        },
        {
          expression: "57",
          highlighted: "",
          operation: "Done",
          explanation: "All steps complete! Final answer is 57."
        }
      ] as FunnelStep[]
    },
    {
      name: "Preset 3",
      expr: "2^3 * (15 - 5 * 2) + 6",
      steps: [
        {
          expression: "2^3 * (15 - 5 * 2) + 6",
          highlighted: "5 * 2",
          operation: "G",
          explanation: "Inside the grouping, evaluate multiplication first: 5 * 2 = 10."
        },
        {
          expression: "2^3 * (15 - 10) + 6",
          highlighted: "(15 - 10)",
          operation: "G",
          explanation: "Finish evaluating the grouping symbol: (15 - 10) = 5."
        },
        {
          expression: "2^3 * 5 + 6",
          highlighted: "2^3",
          operation: "E",
          explanation: "Evaluate the exponent: 2^3 = 8."
        },
        {
          expression: "8 * 5 + 6",
          highlighted: "8 * 5",
          operation: "M",
          explanation: "Multiply: 8 * 5 = 40."
        },
        {
          expression: "40 + 6",
          highlighted: "40 + 6",
          operation: "S",
          explanation: "Finally, add: 40 + 6 = 46."
        },
        {
          expression: "46",
          highlighted: "",
          operation: "Done",
          explanation: "All steps complete! Final answer is 46."
        }
      ] as FunnelStep[]
    }
  ];

  useEffect(() => {
    setSteps(presets[activePreset].steps);
    setCurrentStepIdx(0);
    setIsPlaying(false);
  }, [activePreset]);

  // Autoplay functionality
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setCurrentStepIdx((prev) => {
          if (prev < steps.length - 1) {
            return prev + 1;
          } else {
            setIsPlaying(false);
            return prev;
          }
        });
      }, 3000);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, steps]);

  // Custom Equation Solver (Simple parsing)
  const handleSolveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expressionInput.trim()) return;

    const clean = expressionInput.replace(/\s+/g, "");
    const generatedSteps: FunnelStep[] = [];
    
    let current = clean;

    // 1. Grouping
    if (current.includes("(") && current.includes(")")) {
      const match = current.match(/\(([^)]+)\)/);
      if (match) {
        const inside = match[1];
        const simplifiedInside = evalInsideSimple(inside);
        const highlightedPart = `(${inside})`;
        const replaced = current.replace(highlightedPart, simplifiedInside);
        generatedSteps.push({
          expression: formatNiceExpr(current),
          highlighted: highlightedPart,
          operation: "G",
          explanation: `First, solve Grouping symbols: ${highlightedPart} becomes ${simplifiedInside}.`
        });
        current = replaced;
      }
    }

    // 2. Exponents
    if (current.includes("^")) {
      const match = current.match(/(\d+)\^(\d+)/);
      if (match) {
        const base = parseInt(match[1]);
        const pwr = parseInt(match[2]);
        const res = Math.pow(base, pwr).toString();
        const highlightedPart = `${base}^${pwr}`;
        const replaced = current.replace(highlightedPart, res);
        generatedSteps.push({
          expression: formatNiceExpr(current),
          highlighted: highlightedPart,
          operation: "E",
          explanation: `Next, evaluate Exponents: ${base} raised to the power of ${pwr} is ${res}.`
        });
        current = replaced;
      }
    }

    // 3. Mult / Div
    if (current.includes("*") || current.includes("/")) {
      const match = current.match(/(\d+)([*/])(\d+)/);
      if (match) {
        const num1 = parseFloat(match[1]);
        const op = match[2];
        const num2 = parseFloat(match[3]);
        const res = op === "*" ? num1 * num2 : num1 / num2;
        const highlightedPart = `${match[1]}${op}${match[3]}`;
        const replaced = current.replace(highlightedPart, res.toString());
        generatedSteps.push({
          expression: formatNiceExpr(current),
          highlighted: highlightedPart,
          operation: "M",
          explanation: `Now perform Multiplication/Division from left to right: ${num1} ${op} ${num2} = ${res}.`
        });
        current = replaced;
      }
    }

    // 4. Sub / Add
    if (current.includes("+") || current.includes("-")) {
      const match = current.match(/(\d+)([+-])(\d+)/);
      if (match) {
        const num1 = parseFloat(match[1]);
        const op = match[2];
        const num2 = parseFloat(match[3]);
        const res = op === "+" ? num1 + num2 : num1 - num2;
        const highlightedPart = `${match[1]}${op}${match[3]}`;
        const replaced = current.replace(highlightedPart, res.toString());
        generatedSteps.push({
          expression: formatNiceExpr(current),
          highlighted: highlightedPart,
          operation: "S",
          explanation: `Finally, evaluate Addition/Subtraction from left to right: ${num1} ${op} ${num2} = ${res}.`
        });
        current = replaced;
      }
    }

    try {
      const finalVal = eval(clean.replace(/\^/g, "**"));
      generatedSteps.push({
        expression: finalVal.toString(),
        highlighted: "",
        operation: "Done",
        explanation: `All simplified! The final answer is ${finalVal}.`
      });
    } catch {
      generatedSteps.push({
        expression: "Error",
        highlighted: "",
        operation: "Done",
        explanation: "Could not safely calculate this formula. Double check operators."
      });
    }

    setSteps(generatedSteps);
    setCurrentStepIdx(0);
    setActivePreset(-1);
    setIsPlaying(false);
  };

  const evalInsideSimple = (expr: string): string => {
    try {
      return eval(expr).toString();
    } catch {
      return "0";
    }
  };

  const formatNiceExpr = (str: string): string => {
    return str.replace(/\*/g, " * ").replace(/\+/g, " + ").replace(/\-/g, " - ").replace(/\//g, " / ");
  };

  const renderMath = (expr: string, highlightText: string) => {
    if (!expr) return null;

    const formatExponents = (text: string) => {
      const parts = text.split(/(\d+\^\d+)/g);
      return parts.map((part, i) => {
        if (part.includes("^")) {
          const [base, pwr] = part.split("^");
          return (
            <span key={i} className="inline-flex items-baseline">
              <span>{base}</span>
              <sup className="text-pink-400 font-bold text-xs pl-0.5">{pwr}</sup>
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      });
    };

    if (highlightText && expr.includes(highlightText)) {
      const index = expr.indexOf(highlightText);
      const before = expr.substring(0, index);
      const middle = expr.substring(index, index + highlightText.length);
      const after = expr.substring(index + highlightText.length);

      return (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span>{formatExponents(before)}</span>
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/50 px-2 py-0.5 rounded-md font-bold animate-pulse">
            {formatExponents(middle)}
          </span>
          <span>{formatExponents(after)}</span>
        </div>
      );
    }

    return <div>{formatExponents(expr)}</div>;
  };

  const activeStep = steps[currentStepIdx] || { expression: "", highlighted: "", operation: "Done", explanation: "" };

  const getGemsStatus = (cat: "G" | "E" | "M" | "S") => {
    if (activeStep.operation === "Done") return "completed";
    
    const catPriority = { G: 0, E: 1, M: 2, S: 3, Done: 4 };
    const currentPriority = catPriority[activeStep.operation];
    const itemPriority = catPriority[cat];

    if (currentPriority > itemPriority) return "completed";
    if (currentPriority === itemPriority) return "active";
    return "pending";
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-start font-sans">
      
      {/* Header */}
      <div className="w-full max-w-4xl flex flex-col sm:flex-row justify-between items-center border-b border-slate-800 pb-5 mb-6 gap-4">
        <div className="flex items-center gap-3">
          <span className="text-fuchsia-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold">GEMS Funnel Order Tool</h1>
            <p className="text-xs text-slate-400">Watch expressions narrow down step-by-step through Grouping, Exponents, Multiplication & Division, and Subtraction & Addition.</p>
          </div>
        </div>

        {/* Mascot Tip */}
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
            <span className="font-bold text-pink-400 block">Abbie Says:</span>
            "PEMDAS is old news! We use <span className="font-bold text-white underline">GEMS</span> to remember order of operations perfectly!"
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Controls and Custom Input Column */}
        <div className="md:col-span-1 flex flex-col gap-6">
          
          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-md">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">⚡ Presets</h3>
            <div className="flex flex-col gap-2">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setActivePreset(idx)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-all ${
                    activePreset === idx
                      ? "bg-indigo-600/30 border-indigo-500 text-white font-semibold"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs font-mono text-slate-400 truncate mt-0.5">{p.expr}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-md">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">✏️ Custom Solver</h3>
            <form onSubmit={handleSolveCustom} className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="e.g. 2 * (5 + 1)^2 - 4"
                value={expressionInput}
                onChange={(e) => setExpressionInput(e.target.value)}
                className="bg-slate-900 border border-slate-700 px-3 py-2 rounded-xl text-sm font-mono focus:outline-none focus:border-fuchsia-500 text-center"
              />
              <button
                type="submit"
                className="bg-fuchsia-600 hover:bg-fuchsia-500 py-2 rounded-xl text-xs font-bold border border-fuchsia-500 transition"
              >
                Solve Custom Form
              </button>
            </form>
          </div>

          {/* GEMS Checklist Card */}
          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl shadow-md">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">💎 GEMS Checklist</h3>
            <div className="flex flex-col gap-3">
              {[
                { key: "G", title: "G - Grouping Symbols", desc: "Parentheses (), Brackets []" },
                { key: "E", title: "E - Exponents", desc: "Powers (e.g. 4²)" },
                { key: "M", title: "M - Multiplication / Division", desc: "Left to right" },
                { key: "S", title: "S - Subtraction / Addition", desc: "Left to right" }
              ].map((item) => {
                const status = getGemsStatus(item.key as "G" | "E" | "M" | "S");
                return (
                  <div
                    key={item.key}
                    className={`p-2.5 rounded-xl border transition-all duration-300 flex items-center justify-between gap-3 ${
                      status === "completed"
                        ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
                        : status === "active"
                        ? "bg-amber-500/10 border-amber-500 text-amber-200 animate-pulse"
                        : "bg-slate-900/60 border-slate-800 text-slate-500"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold">{item.title}</div>
                      <div className="text-[10px] opacity-75">{item.desc}</div>
                    </div>
                    <div>
                      {status === "completed" ? (
                        <span className="text-emerald-400 text-sm">✓</span>
                      ) : status === "active" ? (
                        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-ping" />
                      ) : (
                        <span className="text-slate-700 text-xs">•</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Funnel Display Area */}
        <div className="md:col-span-2 bg-slate-800/80 border border-slate-700 p-6 rounded-3xl flex flex-col justify-between shadow-xl min-h-[450px]">
          <div>
            <div className="flex justify-between items-center mb-6">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">🌪️ Funnel Visualizer</span>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setCurrentStepIdx(0);
                    setIsPlaying(false);
                  }}
                  title="Restart"
                  className="bg-slate-900 hover:bg-slate-700 p-1.5 rounded-lg border border-slate-700 transition"
                >
                  ↩
                </button>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg border transition ${
                    isPlaying
                      ? "bg-rose-600/30 border-rose-500 text-rose-300"
                      : "bg-emerald-600/30 border-emerald-500 text-emerald-300"
                  }`}
                >
                  {isPlaying ? "⏸ Pause" : "▶ Play Autoplay"}
                </button>
              </div>
            </div>

            {/* Funnel container */}
            <div className="flex flex-col items-center gap-3 py-4">
              {steps.map((s, idx) => {
                const isActive = currentStepIdx === idx;
                const isPast = currentStepIdx >= idx;

                const totalSteps = steps.length;
                const widthPercent = Math.max(44, 100 - idx * (50 / Math.max(1, totalSteps - 1)));
                
                if (!isPast) return null;

                return (
                  <div
                    key={idx}
                    style={{ width: `${widthPercent}%` }}
                    className={`py-3.5 px-4 rounded-2xl flex flex-col items-center justify-center border text-center transition-all duration-300 transform ${
                      isActive
                        ? "bg-indigo-950/80 border-indigo-500 text-white shadow-lg ring-2 ring-indigo-500/20 scale-102 font-bold"
                        : "bg-slate-900/45 border-slate-800 text-slate-400 opacity-60 text-sm"
                    }`}
                  >
                    {renderMath(s.expression, isActive ? s.highlighted : "")}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Explanation Box */}
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl flex flex-col gap-2 mt-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-fuchsia-400 uppercase tracking-wider">Step {currentStepIdx + 1} of {steps.length} Explanation</span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStepIdx((p) => Math.max(0, p - 1));
                  }}
                  disabled={currentStepIdx === 0}
                  className="bg-slate-800 hover:bg-slate-700 text-xs px-2.5 py-1 rounded-lg border border-slate-700 disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStepIdx((p) => Math.min(steps.length - 1, p + 1));
                  }}
                  disabled={currentStepIdx === steps.length - 1}
                  className="bg-slate-800 hover:bg-slate-700 text-xs px-2.5 py-1 rounded-lg border border-slate-700 disabled:opacity-40"
                >
                  Next Step
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed min-h-[40px]">
              {activeStep.explanation}
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
