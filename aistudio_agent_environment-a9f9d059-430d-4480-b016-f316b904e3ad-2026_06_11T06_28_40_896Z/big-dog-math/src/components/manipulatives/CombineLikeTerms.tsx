"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, RefreshCw, ArrowLeftRight, Sparkles, Trash2, HelpCircle } from "lucide-react";
import confetti from "canvas-confetti";

interface Term {
  id: string;
  coefficient: number;
  variable: string; // "" represents constants, "x" represents variable x, etc.
  sign: "+" | "-";
}

export default function CombineLikeTerms() {
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [originalString, setOriginalString] = useState<string>("3x + 5 + 2x - 1");
  const [currentTerms, setCurrentTerms] = useState<Term[]>([]);
  const [selectedTermIdx, setSelectedTermIdx] = useState<number | null>(null);
  
  // Keep track of simplification history steps
  const [history, setHistory] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" | null }>({ message: "", type: null });
  const [customInput, setCustomInput] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Helper to parse strings like "3x + 5 + 2x - 1" into structured terms
  const parseExpression = (expStr: string): Term[] => {
    // Normalize string spaces
    const cleanStr = expStr.replace(/\s+/g, "");
    
    // Split into tokens with their preceding sign
    const regex = /([+-]?[0-9]*[a-z]+|[+-]?[0-9]+)/gi;
    const matches = cleanStr.match(regex);
    
    if (!matches) return [];

    return matches.map((token, index) => {
      let coeffStr = "";
      let variable = "";
      let sign: "+" | "-" = "+";

      let text = token;
      if (text.startsWith("+")) {
        sign = "+";
        text = text.substring(1);
      } else if (text.startsWith("-")) {
        sign = "-";
        text = text.substring(1);
      }

      // Check if it has variables (e.g. x, y, a)
      const varMatch = text.match(/[a-z]+/gi);
      if (varMatch) {
        variable = varMatch[0];
        coeffStr = text.replace(/[a-z]+/gi, "");
        if (coeffStr === "") coeffStr = "1"; // e.g. "x" is 1x
      } else {
        coeffStr = text;
        variable = ""; // constant
      }

      const coefficient = parseInt(coeffStr) || 1;

      return {
        id: `${index}-${Date.now()}`,
        coefficient,
        variable,
        sign
      };
    });
  };

  const getExpressionString = (termsList: Term[]): string => {
    if (termsList.length === 0) return "0";
    return termsList.map((t, idx) => {
      const signStr = idx === 0 ? (t.sign === "-" ? "-" : "") : `${t.sign} `;
      const coefStr = t.coefficient === 1 && t.variable !== "" ? "" : t.coefficient;
      return `${signStr}${coefStr}${t.variable}`;
    }).join(" ");
  };

  const generateRandomExpression = () => {
    let terms: Term[] = [];
    if (difficulty === "easy") {
      // e.g. 3x + 5 + 2x - 1
      terms = [
        { id: "1", coefficient: 3, variable: "x", sign: "+" },
        { id: "2", coefficient: 5, variable: "", sign: "+" },
        { id: "3", coefficient: 2, variable: "x", sign: "+" },
        { id: "4", coefficient: 1, variable: "", sign: "-" }
      ];
    } else if (difficulty === "medium") {
      // e.g. -4a + 7b - 2a + 3b + 8
      terms = [
        { id: "1", coefficient: 4, variable: "a", sign: "-" },
        { id: "2", coefficient: 7, variable: "b", sign: "+" },
        { id: "3", coefficient: 2, variable: "a", sign: "-" },
        { id: "4", coefficient: 3, variable: "b", sign: "+" },
        { id: "5", coefficient: 8, variable: "", sign: "+" }
      ];
    } else {
      // e.g. 5x^2 - 3x + 2x^2 + 8x - 4
      terms = [
        { id: "1", coefficient: 5, variable: "x²", sign: "+" },
        { id: "2", coefficient: 3, variable: "x", sign: "-" },
        { id: "3", coefficient: 2, variable: "x²", sign: "+" },
        { id: "4", coefficient: 8, variable: "x", sign: "+" },
        { id: "5", coefficient: 4, variable: "", sign: "-" }
      ];
    }

    // Shuffle terms for random layout
    const shuffled = [...terms].sort(() => Math.random() - 0.5);
    setCurrentTerms(shuffled);
    setOriginalString(getExpressionString(shuffled));
    setHistory([getExpressionString(shuffled)]);
    setSelectedTermIdx(null);
    setIsSuccess(false);
    setFeedback({ message: "Rearrange terms so like terms are adjacent, then select them to combine!", type: "info" });
  };

  useEffect(() => {
    generateRandomExpression();
  }, [difficulty]);

  // Load custom user expressions
  const loadCustomExpression = () => {
    if (!customInput.trim()) {
      setFeedback({ message: "Please enter an expression like: 4x + 6 - 2x + 1", type: "error" });
      return;
    }
    const parsed = parseExpression(customInput);
    if (parsed.length === 0) {
      setFeedback({ message: "Could not parse expression. Use standard linear terms (e.g., 5y + 3 - 2y)!", type: "error" });
      return;
    }
    setCurrentTerms(parsed);
    setOriginalString(getExpressionString(parsed));
    setHistory([getExpressionString(parsed)]);
    setSelectedTermIdx(null);
    setIsSuccess(false);
    setCustomInput("");
    setFeedback({ message: "Loaded custom expression successfully! Begin simplification.", type: "success" });
  };

  // Re-arrange / shift term positions
  const handleSwap = (idx1: number, idx2: number) => {
    const updated = [...currentTerms];
    const temp = updated[idx1];
    updated[idx1] = updated[idx2];
    updated[idx2] = temp;
    
    setCurrentTerms(updated);
    setSelectedTermIdx(null);
    setFeedback({ message: "Terms rearranged! Are the like terms next to each other?", type: "info" });
  };

  const selectTerm = (idx: number) => {
    if (selectedTermIdx === null) {
      setSelectedTermIdx(idx);
    } else {
      if (selectedTermIdx === idx) {
        setSelectedTermIdx(null); // Deselect
      } else {
        // If they are adjacent, student might be trying to combine them!
        // If they are NOT adjacent, let's swap them to help rearrange!
        if (Math.abs(selectedTermIdx - idx) === 1) {
          attemptCombine(selectedTermIdx, idx);
        } else {
          handleSwap(selectedTermIdx, idx);
        }
      }
    }
  };

  const attemptCombine = (idx1: number, idx2: number) => {
    const term1 = currentTerms[idx1];
    const term2 = currentTerms[idx2];

    // Check if they are like terms (same variable)
    if (term1.variable !== term2.variable) {
      setFeedback({
        message: `These are unlike terms. ${term1.coefficient}${term1.variable || "constant"} contains a different variable than ${term2.coefficient}${term2.variable || "constant"}. You cannot combine them!`,
        type: "error"
      });
      setSelectedTermIdx(null);
      return;
    }

    // Combine them!
    const val1 = term1.sign === "-" ? -term1.coefficient : term1.coefficient;
    const val2 = term2.sign === "-" ? -term2.coefficient : term2.coefficient;
    const newCoeff = val1 + val2;

    const newTerm: Term = {
      id: `combined-${Date.now()}`,
      coefficient: Math.abs(newCoeff),
      variable: term1.variable,
      sign: newCoeff >= 0 ? "+" : "-"
    };

    const updated = [...currentTerms];
    // Replace the two terms with the one combined term
    const startIdx = Math.min(idx1, idx2);
    updated.splice(startIdx, 2, newTerm);

    // If coefficient is 0, we can completely remove the term (except if it's the last remaining term)
    const filtered = updated.filter((t, index) => t.coefficient !== 0 || updated.length === 1);

    setCurrentTerms(filtered);
    setSelectedTermIdx(null);

    const stepStr = getExpressionString(filtered);
    const newHistory = [...history, stepStr];
    setHistory(newHistory);

    // Check if simplification is complete (no remaining like terms)
    if (isSimplified(filtered)) {
      setIsSuccess(true);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
      setFeedback({
        message: "Great job! You combined the variable terms and constants correctly. The expression is fully simplified!",
        type: "success"
      });
    } else {
      setFeedback({
        message: `Nice combination! Simplified to: ${stepStr}. Keep grouping and combining remaining like terms!`,
        type: "success"
      });
    }
  };

  // Helper to determine if expression has any remaining like terms
  const isSimplified = (termsList: Term[]): boolean => {
    const variables = termsList.map(t => t.variable);
    const uniqueVars = new Set(variables);
    return uniqueVars.size === termsList.length;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            ✏️ Combine Like Terms Simplifier
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-semibold uppercase tracking-wider">
              Algebraic Expressions
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Rearrange terms by clicking, and merge adjacent like terms step-by-step.
          </p>
        </div>

        {/* Difficulty Controls */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setDifficulty("easy")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              difficulty === "easy" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Easy
          </button>
          <button
            onClick={() => setDifficulty("medium")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              difficulty === "medium" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Medium
          </button>
          <button
            onClick={() => setDifficulty("hard")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              difficulty === "hard" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Hard
          </button>
        </div>
      </div>

      {/* Teacher / Custom Expression Entry */}
      <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
            Teacher Tools: Custom Expression
          </h4>
          <p className="text-xs text-slate-400">Enter a custom expression using x, y, a, etc. (e.g. 5x + 3 - 2x + 4)</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. 3x + 10 - 2x - 4"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
          />
          <button
            onClick={loadCustomExpression}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow transition-all"
          >
            Load
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="border border-slate-100 rounded-2xl bg-slate-50 p-6 mb-6">
        <div className="text-center mb-6">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Original Expression</span>
          <div className="text-2xl font-bold text-slate-700 font-mono mt-1">{originalString}</div>
        </div>

        {/* Blocks representation */}
        <div className="flex flex-wrap justify-center items-center gap-3 my-8">
          {currentTerms.map((term, idx) => {
            const isSelected = selectedTermIdx === idx;
            const termSignStr = idx === 0 && term.sign === "+" ? "" : term.sign;
            const termCoeffStr = term.coefficient === 1 && term.variable !== "" ? "" : term.coefficient;

            return (
              <React.Fragment key={term.id}>
                {/* Visual Connector / Separator */}
                {idx > 0 && <span className="text-xl font-bold text-slate-300 font-mono">+</span>}

                <button
                  onClick={() => selectTerm(idx)}
                  className={`px-5 py-4 rounded-xl border-2 transition-all shadow-sm flex flex-col items-center justify-center min-w-[70px] ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/20 scale-105"
                      : "border-white bg-white hover:border-slate-300 hover:shadow text-slate-700"
                  }`}
                >
                  <span className="text-2xl font-extrabold font-mono">
                    {termSignStr}{termCoeffStr}{term.variable || ""}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-1.5">
                    {term.variable === "" ? "Constant" : `Term in ${term.variable}`}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Step-by-Step Simplifier Panel */}
        <div className="bg-white border border-slate-200/60 rounded-xl p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1">
            <Sparkles size={14} className="text-indigo-500" /> Simplification Steps
          </h4>
          <div className="space-y-2 font-mono text-sm text-slate-600 pl-2">
            {history.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300 w-12">Step {idx}:</span>
                <span className={idx === history.length - 1 ? "font-bold text-indigo-600" : ""}>{step}</span>
                {idx === history.length - 1 && isSuccess && (
                  <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-sans font-bold flex items-center gap-0.5">
                    <CheckCircle2 size={12} /> Complete
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Instructions & Feedback */}
      {feedback.message && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 mb-6 transition-all ${
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
            <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          )}
          <div className="text-sm font-semibold">
            {feedback.message}
          </div>
        </div>
      )}

      {/* Touch panel control explanation */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-50 border border-slate-100 p-4 rounded-xl gap-4">
        <div className="text-xs text-slate-500 leading-relaxed max-w-lg">
          <strong>Interactive Board Guide:</strong> 
          <ul className="list-disc pl-4 space-y-0.5 mt-1">
            <li>Click a card, then click any other card to <strong>rearrange positions</strong>.</li>
            <li>Click two adjacent cards of the same family to <strong>combine</strong> them!</li>
          </ul>
        </div>
        <button
          onClick={generateRandomExpression}
          className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-all flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw size={14} /> Reset Expression
        </button>
      </div>
    </div>
  );
}