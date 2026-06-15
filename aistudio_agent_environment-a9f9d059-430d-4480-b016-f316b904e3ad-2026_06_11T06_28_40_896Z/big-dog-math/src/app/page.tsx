"use client";

import React, { useState, useEffect } from "react";
import { BookOpen, Users, Compass, HelpCircle, Star, Sparkles, CheckCircle2, Flame, User, Play, LogOut, ArrowRight, Activity, Laptop, Monitor } from "lucide-react";

// Import our custom manipulatives
import DoubleNumberLine from "@/components/manipulatives/DoubleNumberLine";
import CoordinatePlane from "@/components/manipulatives/CoordinatePlane";
import CombineLikeTerms from "@/components/manipulatives/CombineLikeTerms";
import OrderOfOperationsFunnel from "@/components/manipulatives/OrderOfOperationsFunnel";
import FractionBars from "@/components/manipulatives/FractionBars";
import NumberLine from "@/components/manipulatives/NumberLine";
import AlgebraTiles from "@/components/manipulatives/AlgebraTiles";
import Whiteboard from "@/components/manipulatives/Whiteboard";

// Import teacher tools
import ClassroomTools from "@/components/teacher/ClassroomTools";

import confetti from "canvas-confetti";

export default function Home() {
  // Navigation State
  const [roleMode, setRoleMode] = useState<"teacher" | "student" | "play">("teacher");
  const [teacherActiveTab, setTeacherActiveTab] = useState<"session" | "tools" | "saved">("session");
  const [activeManipulativeId, setActiveManipulativeId] = useState<string>("double-number-line");

  // Session System State
  const [sessionCode, setSessionCode] = useState<string>("");
  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [activeStudents, setActiveStudents] = useState<string[]>([]);
  const [pushedActivity, setPushedActivity] = useState<string | null>(null);
  const [liveSubmissions, setLiveSubmissions] = useState<Array<{ name: string; activity: string; answer: string; time: string }>>([]);

  // Student joining state
  const [studentJoinCode, setStudentJoinCode] = useState<string>("");
  const [studentName, setStudentName] = useState<string>("");
  const [isStudentJoined, setIsStudentJoined] = useState<boolean>(false);
  const [studentAnswerInput, setStudentAnswerInput] = useState<string>("");
  const [studentSubmitted, setStudentSubmitted] = useState<boolean>(false);

  // Quick feedback alert banner
  const [systemAlert, setSystemAlert] = useState<{ message: string; type: "success" | "info" } | null>({
    message: "Welcome to Big Dog Math! Select a dashboard above to explore.",
    type: "info"
  });

  // Generate 6 letter session code
  const generateSessionCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "DOG";
    for (let i = 0; i < 3; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSessionCode(code);
    setSessionActive(true);
    setActiveStudents(["Brenda", "Charlie", "David", "Emma"]);
    setSystemAlert({ message: `Session ${code} generated! Students can now join using this code.`, type: "success" });
  };

  const endSession = () => {
    setSessionActive(false);
    setSessionCode("");
    setActiveStudents([]);
    setPushedActivity(null);
    setLiveSubmissions([]);
    setSystemAlert({ message: "Session ended successfully.", type: "info" });
  };

  const pushActivity = (manipId: string) => {
    if (!sessionActive) {
      setSystemAlert({ message: "Please generate and start an active session code first!", type: "info" });
      return;
    }
    setPushedActivity(manipId);
    setSystemAlert({ message: `Activity pushed to all joined students!`, type: "success" });
  };

  // Student join handler
  const handleStudentJoin = () => {
    if (!studentJoinCode.trim() || !studentName.trim()) {
      setSystemAlert({ message: "Please enter both the session code and your name!", type: "info" });
      return;
    }
    setIsStudentJoined(true);
    setStudentSubmitted(false);
    setStudentAnswerInput("");
    setSystemAlert({ message: `Joined room ${studentJoinCode} successfully!`, type: "success" });
    
    // Simulate real-time updates: add student to class roster list
    if (sessionActive && studentJoinCode.toUpperCase() === sessionCode) {
      setActiveStudents(prev => [...prev, studentName]);
    }
  };

  // Student submit answer handler
  const handleStudentSubmit = () => {
    if (!studentAnswerInput.trim()) return;
    setStudentSubmitted(true);
    setSystemAlert({ message: "Your work has been submitted to the teacher's dashboard!", type: "success" });

    const newSub = {
      name: studentName || "Student",
      activity: pushedActivity || "Free Practice",
      answer: studentAnswerInput,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    setLiveSubmissions(prev => [newSub, ...prev]);
    confetti({ particleCount: 30, spread: 40 });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* Brand Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-6 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-lg font-black shadow-md shadow-indigo-100">
              🐶
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-800">
                Big Dog Math
              </h1>
              <p className="text-[10px] uppercase font-bold tracking-wide text-slate-400">
                The Interactive Classroom Platform
              </p>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50">
            <button
              onClick={() => {
                setRoleMode("teacher");
                setSystemAlert({ message: "Teacher dashboard active. Manage classes and live sessions.", type: "info" });
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                roleMode === "teacher"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              <Monitor size={14} /> Teacher Dashboard
            </button>
            <button
              onClick={() => {
                setRoleMode("student");
                setSystemAlert({ message: "Student room portal. Join an active class with code.", type: "info" });
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                roleMode === "student"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              <Laptop size={14} /> Student Dashboard
            </button>
            <button
              onClick={() => {
                setRoleMode("play");
                setSystemAlert({ message: "Free practice mode. Open any manipulative on demand.", type: "info" });
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                roleMode === "play"
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              <Activity size={14} /> Practice Tools
            </button>
          </div>
        </div>
      </header>

      {/* Banner Notifications */}
      {systemAlert && (
        <div className="bg-indigo-50 border-b border-indigo-100/40 px-6 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs font-semibold text-indigo-950">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span>{systemAlert.message}</span>
            </div>
            <button
              onClick={() => setSystemAlert(null)}
              className="hover:text-indigo-600 font-extrabold uppercase text-[10px]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Context Controls Panel (Teacher or Student context lists) */}
        {roleMode === "teacher" && (
          <div className="lg:col-span-3 flex flex-col gap-5">
            {/* Quick Session Launch Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Users size={16} className="text-indigo-600" /> Active Session
              </h3>

              {!sessionActive ? (
                <div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    Ready to start a live class? Generate a join code to let students sync in real-time.
                  </p>
                  <button
                    onClick={generateSessionCode}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 font-bold text-xs text-white rounded-xl shadow transition-all active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Play size={13} /> Launch Live Room
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">Join Room Code</span>
                    <span className="text-3xl font-black text-indigo-950 tracking-wider">{sessionCode}</span>
                  </div>

                  {/* Class roster listing */}
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Joined Students ({activeStudents.length})</span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                      {activeStudents.map((st, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-slate-100 text-[11px] font-bold text-slate-600 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {st}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Pushed Activity info */}
                  {pushedActivity && (
                    <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-600" />
                      <span>Pushed: {pushedActivity.replace(/-/g, " ")}</span>
                    </div>
                  )}

                  {/* Push Actions */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Push Active Practice</span>
                    <button
                      onClick={() => pushActivity(activeManipulativeId)}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all"
                    >
                      Push "{activeManipulativeId.replace(/-/g, " ")}"
                    </button>
                  </div>

                  <button
                    onClick={endSession}
                    className="w-full py-2 border border-red-200 bg-red-50 hover:bg-red-100 font-bold text-xs text-red-600 rounded-xl transition-all flex items-center justify-center gap-1.5"
                  >
                    <LogOut size={13} /> End Session
                  </button>
                </div>
              )}
            </div>

            {/* Teacher Tabs Menu */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-1">
              <button
                onClick={() => setTeacherActiveTab("session")}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  teacherActiveTab === "session" ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                📊 Active Student Submissions
              </button>
              <button
                onClick={() => setTeacherActiveTab("tools")}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  teacherActiveTab === "tools" ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                🛠️ Classroom Tools Panel
              </button>
              <button
                onClick={() => setTeacherActiveTab("saved")}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  teacherActiveTab === "saved" ? "bg-slate-100 text-slate-800" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                💾 Pre-configured Activities
              </button>
            </div>
          </div>
        )}

        {roleMode === "student" && (
          <div className="lg:col-span-3 flex flex-col gap-5">
            {/* Student Joining Box */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Laptop size={16} className="text-indigo-600" /> Enter Classroom
              </h3>

              {!isStudentJoined ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Join Room Code</label>
                    <input
                      type="text"
                      placeholder="e.g. DOG123"
                      value={studentJoinCode}
                      onChange={(e) => setStudentJoinCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-bold rounded-lg border border-slate-200 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Your Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Sam Jenkins"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleStudentJoin}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all"
                  >
                    Join Class Session
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block">Joined Room</span>
                    <span className="text-md font-extrabold text-emerald-950 tracking-wide">Joined as {studentName}</span>
                  </div>

                  {pushedActivity ? (
                    <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-xs font-semibold text-amber-800">
                      <p className="font-bold mb-1 uppercase tracking-wide">Pushed Task:</p>
                      <p>The teacher wants you to open and complete the <strong>{pushedActivity.replace(/-/g, " ")}</strong> manipulative!</p>
                      <button
                        onClick={() => setActiveManipulativeId(pushedActivity)}
                        className="mt-2.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-[10px] uppercase transition-all"
                      >
                        Open Active Tool
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 leading-relaxed text-center py-2">
                      Waiting for teacher to push a classroom manipulative... You can practice freely in the meantime!
                    </div>
                  )}

                  {/* Submission Widget */}
                  <div className="border border-slate-100 p-3 bg-slate-50 rounded-xl space-y-2">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Submit Answer to Board</label>
                    <input
                      type="text"
                      placeholder="e.g. 5x + 4"
                      value={studentAnswerInput}
                      onChange={(e) => setStudentAnswerInput(e.target.value)}
                      disabled={studentSubmitted}
                      className="w-full px-2 py-1 text-xs font-semibold rounded border border-slate-200 bg-white"
                    />
                    <button
                      onClick={handleStudentSubmit}
                      disabled={studentSubmitted}
                      className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 font-bold text-xs text-white rounded-lg transition-all"
                    >
                      {studentSubmitted ? "Submitted!" : "Send Answer"}
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setIsStudentJoined(false);
                      setStudentSubmitted(false);
                      setStudentAnswerInput("");
                    }}
                    className="w-full py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-bold text-xs rounded-xl transition-all"
                  >
                    Leave Session
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {roleMode === "play" && (
          <div className="lg:col-span-3">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Activity size={16} className="text-indigo-600" /> Student Practice
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Welcome to direct practice! Select any manipulative from the center dashboard grid to solve exercises independently. No session or connection required.
              </p>
            </div>
          </div>
        )}

        {/* Center/Right Column: Pushed activities, live submissions, or active manipulative */}
        <div className="lg:col-span-9 flex flex-col gap-6">
          
          {/* Active submissions table (for teacher dashboard) */}
          {roleMode === "teacher" && teacherActiveTab === "session" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-md font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                <Activity size={18} className="text-indigo-600 animate-pulse" /> Live Student Submissions Portal
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Watch real-time student math submissions, answers, and solutions stream here as they complete pushed activities.
              </p>

              {liveSubmissions.length > 0 ? (
                <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                        <th className="p-3">Student</th>
                        <th className="p-3">Active Tool</th>
                        <th className="p-3 text-center">Submitted Solution</th>
                        <th className="p-3 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold">
                      {liveSubmissions.map((sub, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-3 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            {sub.name}
                          </td>
                          <td className="p-3 capitalize">{sub.activity.replace(/-/g, " ")}</td>
                          <td className="p-3 text-center">
                            <span className="px-2.5 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full font-mono font-bold">
                              {sub.answer}
                            </span>
                          </td>
                          <td className="p-3 text-right text-slate-400 font-medium">{sub.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-xl">
                  Waiting for student responses... Pushed activity answers from students will stream here in real time.
                </div>
              )}
            </div>
          )}

          {/* Classroom Tools tab selection (for teacher dashboard) */}
          {roleMode === "teacher" && teacherActiveTab === "tools" && (
            <ClassroomTools />
          )}

          {/* Saved activities listings (for teacher dashboard) */}
          {roleMode === "teacher" && teacherActiveTab === "saved" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-md font-bold text-slate-800 mb-1">Pre-configured Activities & Puzzles</h3>
              <p className="text-xs text-slate-400 mb-4">Choose from pre-made interactive templates to push directly to students.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="border border-slate-100 p-4 rounded-xl hover:border-indigo-100 hover:bg-slate-50/30 transition-all">
                  <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">Ratio & Proportion</span>
                  <h4 className="text-sm font-bold text-slate-800 mt-1">Cups to Ounces scaling equivalence</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">Let student solve blank boxes on a 3 cups to 24 ounces scale.</p>
                  <button
                    onClick={() => { setActiveManipulativeId("double-number-line"); pushActivity("double-number-line"); }}
                    className="mt-3.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase rounded transition-all"
                  >
                    Open & Push to Class
                  </button>
                </div>

                <div className="border border-slate-100 p-4 rounded-xl hover:border-indigo-100 hover:bg-slate-50/30 transition-all">
                  <span className="text-[10px] font-bold text-sky-500 uppercase tracking-wide">Coordinate Plane</span>
                  <h4 className="text-sm font-bold text-slate-800 mt-1">Plot coordinates (3, -2) in four quadrants</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">Plot targeted point puzzle in positive and negative zones.</p>
                  <button
                    onClick={() => { setActiveManipulativeId("coordinate-plane"); pushActivity("coordinate-plane"); }}
                    className="mt-3.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] uppercase rounded transition-all"
                  >
                    Open & Push to Class
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Manipulative Playground Selection row (Visible in all modes for flexibility) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Interactive Manipulative Selector</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3.5">
              {[
                { id: "double-number-line", name: "Double Number Line" },
                { id: "coordinate-plane", name: "Coordinate Plane" },
                { id: "combine-like-terms", name: "Combine Like Terms" },
                { id: "pemdas-funnel", name: "PEMDAS Funnel" },
                { id: "fraction-bars", name: "Fraction Bars" },
                { id: "number-line", name: "Number Line" },
                { id: "algebra-tiles", name: "Algebra Tiles" },
                { id: "whiteboard", name: "Whiteboard" }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setActiveManipulativeId(m.id)}
                  className={`p-2.5 text-xs font-bold rounded-xl border text-center transition-all ${
                    activeManipulativeId === m.id
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100 scale-105"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/60"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {/* Render Active Manipulative Box */}
          <div className="transition-all animate-fade">
            {activeManipulativeId === "double-number-line" && <DoubleNumberLine />}
            {activeManipulativeId === "coordinate-plane" && <CoordinatePlane />}
            {activeManipulativeId === "combine-like-terms" && <CombineLikeTerms />}
            {activeManipulativeId === "pemdas-funnel" && <OrderOfOperationsFunnel />}
            {activeManipulativeId === "fraction-bars" && <FractionBars />}
            {activeManipulativeId === "number-line" && <NumberLine />}
            {activeManipulativeId === "algebra-tiles" && <AlgebraTiles />}
            {activeManipulativeId === "whiteboard" && <Whiteboard />}
          </div>

        </div>
      </main>

      {/* Professional Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 font-semibold gap-4">
          <p>© 2026 Big Dog Math. All rights reserved. Built for Smartboards and Panels.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-indigo-600">Privacy Policy</a>
            <a href="#" className="hover:text-indigo-600">Terms of Use</a>
            <p>You can download the full sandbox snapshot via the settings panel download button!</p>
          </div>
        </div>
      </footer>
    </div>
  );
}