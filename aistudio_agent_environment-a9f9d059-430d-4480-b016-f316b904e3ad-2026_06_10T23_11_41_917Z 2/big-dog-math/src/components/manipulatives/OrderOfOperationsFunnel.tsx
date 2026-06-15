"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, RefreshCw, Eye, Sparkles, HelpCircle } from "lucide-react";
import confetti from "canvas-confetti";

interface FunnelStep {
  expression: string;
  tokens: string[];
  activeOperatorIdx: number | null;
}

export default function OrderOfOperationsFunnel() {
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [includeExponents, setIncludeExponents] = useState<boolean>(false);
  const [customInput, setCustomInput] = useState<string>("");
  
  // Steps in the funnel
  const [steps, setSteps] = useState<FunnelStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ message: string; type: "success" | "error" | "info" | null }>({ message: "", type: null });
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Active prompt for evaluating the selected correct operation
  const [evalPrompt, setEvalPrompt] = useState<{
    opStr: string;
    term1: number;
    term2: number;
    op: string;
    tokenIdx: number;
  } | null>(null);
  const [studentEvalInput, setStudentEvalInput] = useState<string>("");

  // Sample expressions
  const expressionsPool = {
    easy: [
      "12 + 4 * 3",
      "25 - 10 / 2",
      "18 / (6 - 3)",
      "24 - 3 * (2 + 4)",
      "(8 + 4) / 3"
    ],
    medium: [
      "15 - (3 + 2) * 2",
      "3 * (8 + 2) - 14",
      "40 / (4 * 2) + 7",
      "6 + 24 / (3 * 2)"
    ],
    hard: [
      "2^3 * (5 - 3) + 4",
      "12 + 3^2 * 2 - 5",
      "(6 + 4) * 2^2 / 8",
      "50 - 4^2 + (12 - 3)"
    ]
  };

  const loadRandomExpression = () => {
    let pool = expressionsPool[difficulty];
    if (!includeExponents && difficulty === "hard") {
      pool = expressionsPool["medium"];
    }
    const expr = pool[Math.floor(Math.random() * pool.length)];
    initializeFunnel(expr);
  };

  const tokenize = (expr: string): string[] => {
    // Normalizes spaces around tokens and splits them
    const clean = expr.replace(/\(/g, " ( ").replace(/\)/g, " ) ")
                      .replace(/\+/g, " + ").replace(/\-/g, " - ")
                      .replace(/\*/g, " * ").replace(/\//g, " / ")
                      .replace(/\^/g, " ^ ");
    return clean.trim().split(/\s+/);
  };

  const initializeFunnel = (expressionStr: string) => {
    const tokens = tokenize(expressionStr);
    setSteps([{
      expression: expressionStr,
      tokens,
      activeOperatorIdx: null
    }]);
    setCurrentStepIdx(0);
    setEvalPrompt(null);
    setStudentEvalInput("");
    setIsSuccess(false);
    setFeedback({ message: "Look at the expression. Click the operator (+, -, *, /, ^) that should be simplified FIRST!", type: "info" });
  };

  useEffect(() => {
    loadRandomExpression();
  }, [difficulty, includeExponents]);

  const loadCustomExpression = () => {
    if (!customInput.trim()) {
      setFeedback({ message: "Please enter an expression like: 18 - 3 * (4 + 2)", type: "error" });
      return;
    }
    initializeFunnel(customInput);
    setCustomInput("");
    setFeedback({ message: "Loaded custom expression! Start by selecting the first operation.", type: "success" });
  };

  // PEMDAS Priority checker
  const findHighestPriorityOperator = (tokens: string[]): number => {
    // Helper to evaluate priority
    // 1. Parentheses contents: find deepest/first parenthesis
    // Let's see if there are parentheses
    let openParenIdx = -1;
    let closeParenIdx = -1;
    let depth = 0;

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === "(") {
        openParenIdx = i;
      } else if (tokens[i] === ")") {
        closeParenIdx = i;
        break; // found the matching inner closing bracket
      }
    }

    // If parentheses exist, we prioritize operators inside them!
    if (openParenIdx !== -1 && closeParenIdx !== -1) {
      const subTokens = tokens.slice(openParenIdx + 1, closeParenIdx);
      const subHighestIdx = findOperatorInSlice(subTokens);
      if (subHighestIdx !== -1) {
        return openParenIdx + 1 + subHighestIdx;
      }
    }

    // If no parentheses are active, look at exponents
    return findOperatorInSlice(tokens);
  };

  const findOperatorInSlice = (slice: string[]): number => {
    // Priority levels: Exponent (^) > Multi/Div (*, /) > Add/Sub (+, -)
    const operators = [["^"], ["*", "/"], ["+", "-"]];

    for (const levelOps of operators) {
      for (let i = 0; i < slice.length; i++) {
        if (levelOps.includes(slice[i])) {
          return i;
        }
      }
    }
    return -1;
  };

  // Handle clicking on an operator in a step
  const handleOperatorClick = (tokenIdx: number, stepIdx: number) => {
    if (stepIdx !== currentStepIdx || isSuccess) return;

    const currentStep = steps[stepIdx];
    const token = currentStep.tokens[tokenIdx];

    // Verify it is an operator
    if (!["+", "-", "*", "/", "^"].includes(token)) {
      return;
    }

    // Find mathematically correct operator index under PEMDAS
    const correctIdx = findHighestPriorityOperator(currentStep.tokens);

    if (tokenIdx !== correctIdx) {
      // Provide educational feedback based on the error
      const correctOp = currentStep.tokens[correctIdx];
      let reason = "Remember PEMDAS: Parentheses, Exponents, Multiplication & Division (left to right), and Addition & Subtraction (left to right).";
      
      if (correctOp === "^") {
        reason = "Exponents (^) must be completed before other basic operations.";
      } else if (["*", "/"].includes(correctOp) && ["+", "-"].includes(token)) {
        reason = "Multiplication (*) and Division (/) must be completed before Addition (+) or Subtraction (-).";
      } else if (currentStep.tokens.includes("(") && !isTokenInsideParen(tokenIdx, currentStep.tokens)) {
        reason = "You must simplify inside Parentheses ( ) first!";
      }

      setFeedback({
        message: `Incorrect operation selected. ${reason}`,
        type: "error"
      });
      return;
    }

    // Correct operator! Set up eval prompt
    const operand1 = parseFloat(currentStep.tokens[tokenIdx - 1]);
    const operand2 = parseFloat(currentStep.tokens[tokenIdx + 1]);

    setFeedback({ message: "Correct choice! Now simplify this operation in the input box.", type: "success" });
    setEvalPrompt({
      opStr: `${currentStep.tokens[tokenIdx - 1]} ${token} ${currentStep.tokens[tokenIdx + 1]}`,
      term1: operand1,
      term2: operand2,
      op: token,
      tokenIdx
    });
    setStudentEvalInput("");
  };

  const isTokenInsideParen = (idx: number, tokens: string[]): boolean => {
    let openCount = 0;
    for (let i = 0; i < idx; i++) {
      if (tokens[i] === "(") openCount++;
      if (tokens[i] === ")") openCount--;
    }
    return openCount > 0;
  };

  // Verify numerical value for the operation
  const checkEvalAnswer = () => {
    if (!evalPrompt) return;

    let correctAnswer = 0;
    const { term1, term2, op, tokenIdx } = evalPrompt;

    switch (op) {
      case "+": correctAnswer = term1 + term2; break;
      case "-": correctAnswer = term1 - term2; break;
      case "*": correctAnswer = term1 * term2; break;
      case "/": correctAnswer = term1 / term2; break;
      case "^": correctAnswer = Math.pow(term1, term2); break;
    }

    const val = parseFloat(studentEvalInput);
    if (isNaN(val) || Math.abs(val - correctAnswer) > 0.01) {
      setFeedback({ message: `Incorrect calculation for: ${evalPrompt.opStr}. Take another look!`, type: "error" });
      return;
    }

    // Correct simplification! Form next step
    const currentStep = steps[currentStepIdx];
    const nextTokens = [...currentStep.tokens];

    // Replace operand1, operator, operand2 with result
    nextTokens.splice(tokenIdx - 1, 3, correctAnswer.toString());

    // Check if there are redundant enclosing parentheses around a single value, e.g. ( 12 )
    for (let i = 0; i < nextTokens.length - 2; i++) {
      if (nextTokens[i] === "(" && nextTokens[i+2] === ")") {
        nextTokens.splice(i + 2, 1); // remove )
        nextTokens.splice(i, 1);     // remove (
      }
    }

    const nextExpr = nextTokens.join(" ");

    const nextStep: FunnelStep = {
      expression: nextExpr,
      tokens: nextTokens,
      activeOperatorIdx: null
    };

    const updatedSteps = [...steps, nextStep];
    setSteps(updatedSteps);
    setCurrentStepIdx(currentStepIdx + 1);
    setEvalPrompt(null);
    setStudentEvalInput("");

    // Check if fully simplified (single token remains)
    if (nextTokens.length === 1) {
      setIsSuccess(true);
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
      setFeedback({
        message: "Excellent work! You simplified the entire expression correctly, forming a perfect funnel! 🎉",
        type: "success"
      });
    } else {
      setFeedback({
        message: `Great! The step simplified to: ${nextExpr}. What is the next operation?`,
        type: "success"
      });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            🍿 PEMDAS Funnel Tool
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 font-semibold uppercase tracking-wider">
              Order of Operations
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Build a visual funnel by completing one operation per line in the correct order.
          </p>
        </div>

        {/* Level Selector */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => { setDifficulty("easy"); setIncludeExponents(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              difficulty === "easy" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Easy
          </button>
          <button
            onClick={() => { setDifficulty("medium"); setIncludeExponents(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              difficulty === "medium" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Medium
          </button>
          <button
            onClick={() => { setDifficulty("hard"); setIncludeExponents(true); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              difficulty === "hard" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-600 hover:text-slate-800"
            }`}
          >
            Hard (Exponents)
          </button>
        </div>
      </div>

      {/* Custom Inputs */}
      <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
            Teacher custom expressions
          </h4>
          <p className="text-xs text-slate-400">Include exponents like 2^3 or standard multiplication/division.</p>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. 15 - 3 * (4 + 2)"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
          />
          <button
            onClick={loadCustomExpression}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow transition-all animate-fade"
          >
            Load
          </button>
        </div>
      </div>

      {/* Funnel Display Area */}
      <div className="border border-slate-100 rounded-2xl bg-slate-50 p-6 mb-6 flex flex-col items-center">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Simplification Funnel</span>

        {/* Funnel Stack */}
        <div className="w-full flex flex-col items-center gap-4">
          {steps.map((step, sIdx) => {
            const isCurrent = sIdx === currentStepIdx;
            
            // Generate visual funnel narrowness padding based on step index
            // Center alignment with narrowing width classes creates a stunning funnel effect!
            const maxWidths = ["max-w-md", "max-w-sm", "max-w-xs", "max-w-[200px]", "max-w-[140px]"];
            const selectedWidth = maxWidths[Math.min(sIdx, maxWidths.length - 1)];

            return (
              <div
                key={`step-${sIdx}`}
                className={`w-full ${selectedWidth} p-4 rounded-2xl border text-center transition-all shadow-sm ${
                  isCurrent
                    ? "bg-white border-indigo-200 ring-4 ring-indigo-500/5"
                    : "bg-slate-100/80 border-slate-200/50 text-slate-500"
                }`}
              >
                <div className="flex flex-wrap justify-center items-center gap-1.5 font-mono text-lg font-bold">
                  {step.tokens.map((token, tIdx) => {
                    const isOperator = ["+", "-", "*", "/", "^"].includes(token);
                    const clickable = isCurrent && isOperator && !isSuccess;

                    return (
                      <span
                        key={`tok-${tIdx}`}
                        onClick={() => clickable && handleOperatorClick(tIdx, sIdx)}
                        className={`px-1.5 py-0.5 rounded transition-all ${
                          clickable
                            ? "bg-indigo-50 text-indigo-600 border border-indigo-200 cursor-pointer hover:bg-indigo-600 hover:text-white hover:scale-105 active:scale-95"
                            : isOperator
                            ? "text-slate-400"
                            : "text-slate-800"
                        }`}
                        title={clickable ? "Click to evaluate this operation" : undefined}
                      >
                        {token === "*" ? "×" : token === "/" ? "÷" : token}
                      </span>
                    );
                  })}
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1.5">
                  {sIdx === steps.length - 1 && isSuccess
                    ? "Final Answer!"
                    : isCurrent
                    ? "Select Next Operation"
                    : `Step ${sIdx}`}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating evaluation prompt box */}
      {evalPrompt && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-bounce">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-indigo-500 text-white font-bold">PEMDAS</span>
            <div>
              <p className="text-xs font-bold text-indigo-800 uppercase tracking-wide">Evaluate selected operation:</p>
              <p className="text-lg font-extrabold text-indigo-950 font-mono mt-0.5">
                {evalPrompt.opStr.replace("*", "×").replace("/", "÷")}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Result"
              value={studentEvalInput}
              onChange={(e) => setStudentEvalInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && checkEvalAnswer()}
              className="w-24 px-3 py-2 text-center text-md font-bold rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={checkEvalAnswer}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md transition-all shrink-0"
            >
              Verify Step
            </button>
          </div>
        </div>
      )}

      {/* Feedback Alert banner */}
      {feedback.message && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-2.5 mb-6 ${
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

      {/* Footer and rules banner */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-50 border border-slate-100 p-4 rounded-xl gap-4">
        <div className="text-xs text-slate-500 leading-relaxed max-w-lg">
          <strong>PEMDAS Order of Operations Review:</strong>
          <ol className="list-decimal pl-4 space-y-0.5 mt-1 font-semibold text-slate-600">
            <li>Parentheses ( ) contents first</li>
            <li>Exponents ^ next</li>
            <li>Multiplication × and Division ÷ (from left to right)</li>
            <li>Addition + and Subtraction - (from left to right)</li>
          </ol>
        </div>
        <button
          onClick={loadRandomExpression}
          className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm transition-all flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw size={14} /> New Equation
        </button>
      </div>
    </div>
  );
}