"use client";

import React, { useState, useEffect } from "react";
import { User, Users, Timer as TimerIcon, Trophy, Vote, Plus, Minus, Trash2, Play, Pause, RotateCcw, RefreshCw, Star, CheckCircle2, AlertCircle } from "lucide-react";
import confetti from "canvas-confetti";

export default function ClassroomTools() {
  const [activeTab, setActiveTab] = useState<"picker" | "groups" | "timer" | "tracker" | "poll">("picker");

  // Shared Student List State (preset with cute names)
  const [studentList, setStudentList] = useState<string>("Alex, Brenda, Charlie, David, Emma, Frankie, Grace, Henry, Ivy, Jack, Keila, Leo");
  
  // 1. RANDOM STUDENT PICKER STATE
  const [isPicking, setIsPicking] = useState<boolean>(false);
  const [pickedStudent, setPickedStudent] = useState<string | null>(null);
  const [studentPickStats, setStudentPickStats] = useState<Record<string, number>>({});

  const getStudentsArray = () => {
    return studentList.split(",").map(s => s.trim()).filter(s => s.length > 0);
  };

  const pickRandomStudent = () => {
    const arr = getStudentsArray();
    if (arr.length === 0) return;

    setIsPicking(true);
    setPickedStudent(null);
    
    // Simulate spinning names
    let counter = 0;
    const interval = setInterval(() => {
      const tempWinner = arr[Math.floor(Math.random() * arr.length)];
      setPickedStudent(tempWinner);
      counter++;
      if (counter > 15) {
        clearInterval(interval);
        const finalWinner = arr[Math.floor(Math.random() * arr.length)];
        setPickedStudent(finalWinner);
        setIsPicking(false);
        
        // Log stats
        setStudentPickStats(prev => ({
          ...prev,
          [finalWinner]: (prev[finalWinner] || 0) + 1
        }));

        // Celebrations!
        confetti({ particleCount: 50, spread: 45, origin: { y: 0.8 } });
      }
    }, 100);
  };

  // 2. GROUP GENERATOR STATE
  const [groupCount, setGroupCount] = useState<number>(3);
  const [generatedGroups, setGeneratedGroups] = useState<string[][]>([]);

  const generateGroups = () => {
    const arr = [...getStudentsArray()].sort(() => Math.random() - 0.5);
    if (arr.length === 0) return;

    const result: string[][] = Array.from({ length: groupCount }, () => []);
    arr.forEach((student, index) => {
      result[index % groupCount].push(student);
    });

    setGeneratedGroups(result);
  };

  // 3. CLASS TIMER STATE
  const [secondsLeft, setSecondsLeft] = useState<number>(120); // default 2 minutes
  const [timerActive, setTimerActive] = useState<boolean>(false);

  useEffect(() => {
    let timer: any = null;
    if (timerActive && secondsLeft > 0) {
      timer = setInterval(() => {
        setSecondsLeft(prev => prev - 1);
      }, 1000);
    } else if (secondsLeft === 0 && timerActive) {
      setTimerActive(false);
      confetti({ particleCount: 100, spread: 80 });
    }
    return () => clearInterval(timer);
  }, [timerActive, secondsLeft]);

  const formatTimer = () => {
    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const applyTimerPreset = (secs: number) => {
    setTimerActive(false);
    setSecondsLeft(secs);
  };

  // 4. PARTICIPATION TRACKER STATE
  const [points, setPoints] = useState<Record<string, number>>({});

  const adjustPoints = (student: string, amount: number) => {
    setPoints(prev => ({
      ...prev,
      [student]: (prev[student] || 0) + amount
    }));
  };

  // 5. EXIT TICKET / QUICK POLL STATE
  const [pollQuestion, setPollQuestion] = useState<string>("Which fraction is equivalent to 3/12?");
  const [pollOptions, setPollOptions] = useState<string[]>(["1/2", "1/4", "1/3", "2/6"]);
  const [pollResponses, setPollResponses] = useState<Record<string, string>>({});
  const [isPollRunning, setIsPollRunning] = useState<boolean>(false);

  const startPoll = () => {
    setIsPollRunning(true);
    setPollResponses({});
    
    // Simulate incoming real-time student responses
    const students = getStudentsArray();
    let index = 0;
    const responseInterval = setInterval(() => {
      if (index >= students.length) {
        clearInterval(responseInterval);
        return;
      }
      // Give random student answer
      const student = students[index];
      // Weighted towards 1/4 (index 1) which is correct
      const roll = Math.random();
      const answer = roll < 0.6 ? "1/4" : pollOptions[Math.floor(Math.random() * pollOptions.length)];
      
      setPollResponses(prev => ({
        ...prev,
        [student]: answer
      }));
      index++;
    }, 800);
  };

  const getPollChartData = () => {
    const counts: Record<string, number> = {};
    pollOptions.forEach(opt => counts[opt] = 0);
    Object.values(pollResponses).forEach(resp => {
      if (counts[resp] !== undefined) counts[resp]++;
    });
    return counts;
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-md p-6 max-w-4xl mx-auto">
      {/* Title & Student List Configurator */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-slate-100 pb-6 mb-6">
        <div className="md:col-span-2">
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            🛠️ Teacher Classroom Tools
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 font-semibold uppercase tracking-wider">
              Engagement Suite
            </span>
          </h2>
          <p className="text-slate-500 text-sm mt-1 leading-relaxed">
            Select student pickers, group generators, class timers, or exit ticket polls to run on your board or interactive screens.
          </p>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
            Active Student Roster
          </label>
          <textarea
            value={studentList}
            onChange={(e) => setStudentList(e.target.value)}
            className="w-full h-16 p-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
            placeholder="Alex, Brenda, Charlie..."
          />
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-100 pb-4">
        <button
          onClick={() => setActiveTab("picker")}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "picker"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <User size={15} /> Student Picker
        </button>
        <button
          onClick={() => setActiveTab("groups")}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "groups"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Users size={15} /> Group Generator
        </button>
        <button
          onClick={() => setActiveTab("timer")}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "timer"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <TimerIcon size={15} /> Class Timer
        </button>
        <button
          onClick={() => setActiveTab("tracker")}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "tracker"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Trophy size={15} /> Score Tracker
        </button>
        <button
          onClick={() => setActiveTab("poll")}
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "poll"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-100"
              : "bg-slate-50 text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Vote size={15} /> Quick Poll Tool
        </button>
      </div>

      {/* Tab Contents */}
      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 min-h-[300px] flex flex-col justify-center">
        
        {/* 1. STUDENT PICKER */}
        {activeTab === "picker" && (
          <div className="text-center max-w-md mx-auto">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Random Student Spinner</h3>
            <p className="text-xs text-slate-400 mb-6">Select a student at random to participate or answer math equations!</p>

            <div className="bg-white border-2 border-dashed border-indigo-200 rounded-3xl p-8 shadow-sm flex flex-col items-center justify-center min-h-[160px] mb-6">
              {isPicking ? (
                <div className="text-3xl font-extrabold text-indigo-500 animate-bounce tracking-wide">
                  {pickedStudent || "Choosing..."}
                </div>
              ) : pickedStudent ? (
                <div className="animate-fade">
                  <div className="text-sm font-bold text-slate-400 uppercase tracking-wide">Selected Winner!</div>
                  <div className="text-4xl font-extrabold text-indigo-600 font-serif my-2 drop-shadow-sm">
                    ✨ {pickedStudent} ✨
                  </div>
                  <div className="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                    <Star size={12} fill="currentColor" /> Picked {studentPickStats[pickedStudent] || 1} times
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-sm font-semibold">
                  No student picked yet. Click "SPIN WHEEL" below!
                </div>
              )}
            </div>

            <button
              onClick={pickRandomStudent}
              disabled={isPicking}
              className="px-6 py-3 font-extrabold text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 rounded-2xl shadow-lg shadow-indigo-100 tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 mx-auto"
            >
              <RefreshCw size={16} className={isPicking ? "animate-spin" : ""} /> SPIN WHEEL
            </button>
          </div>
        )}

        {/* 2. GROUP GENERATOR */}
        {activeTab === "groups" && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white p-4 rounded-xl border border-slate-200/60">
              <div>
                <h3 className="text-md font-bold text-slate-800">Classroom Group Maker</h3>
                <p className="text-xs text-slate-400">Instantly split your students into random, equal teams.</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-500">Number of Groups:</label>
                <input
                  type="number"
                  min="2"
                  max="8"
                  value={groupCount}
                  onChange={(e) => setGroupCount(parseInt(e.target.value) || 2)}
                  className="w-16 px-2 py-1 text-center font-bold border border-slate-200 rounded-lg focus:outline-none"
                />
                <button
                  onClick={generateGroups}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow transition-all"
                >
                  Create Groups
                </button>
              </div>
            </div>

            {generatedGroups.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {generatedGroups.map((group, gIdx) => (
                  <div key={gIdx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 mb-3 border-b border-indigo-50 pb-1 flex items-center justify-between">
                      <span>Group {gIdx + 1}</span>
                      <span className="text-[10px] text-slate-400 font-bold lowercase">{group.length} students</span>
                    </h4>
                    <ul className="space-y-1.5 text-xs font-semibold text-slate-700">
                      {group.map((st, sIdx) => (
                        <li key={sIdx} className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          {st}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 font-semibold text-sm bg-white border border-slate-100 rounded-2xl">
                Choose the number of groups and click "Create Groups" to generate random panels!
              </div>
            )}
          </div>
        )}

        {/* 3. CLASS TIMER */}
        {activeTab === "timer" && (
          <div className="text-center max-w-md mx-auto">
            <h3 className="text-md font-bold text-slate-800 mb-4">Classroom Countdown</h3>
            
            {/* Digital Clock */}
            <div className={`text-6xl font-extrabold font-mono tracking-wider mb-6 ${secondsLeft === 0 ? "text-rose-500 animate-pulse" : "text-slate-800"}`}>
              {formatTimer()}
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-3 mb-6">
              <button
                onClick={() => setTimerActive(!timerActive)}
                className={`px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition-all flex items-center gap-1.5 ${
                  timerActive ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {timerActive ? <Pause size={14} /> : <Play size={14} />}
                {timerActive ? "Pause" : "Start"}
              </button>
              <button
                onClick={() => { setTimerActive(false); setSecondsLeft(120); }}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
              >
                <RotateCcw size={14} /> Reset
              </button>
            </div>

            {/* Presets */}
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2.5">
                Quick Preset Durations
              </span>
              <div className="flex justify-center gap-2">
                <button onClick={() => applyTimerPreset(30)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">
                  30s (Quick Poll)
                </button>
                <button onClick={() => applyTimerPreset(60)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">
                  1 Min (Warmup)
                </button>
                <button onClick={() => applyTimerPreset(300)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">
                  5 Min (Task)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. SCORE TRACKER */}
        {activeTab === "tracker" && (
          <div>
            <h3 className="text-md font-bold text-slate-800 mb-1">Participation & Engagement Scoreboard</h3>
            <p className="text-xs text-slate-400 mb-4">Click plus or minus to log positive reinforcement tokens during lessons.</p>
            
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-extrabold uppercase tracking-wider">
                    <th className="p-3">Student Name</th>
                    <th className="p-3 text-center">Reinforcement Score</th>
                    <th className="p-3 text-right">Adjust Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                  {getStudentsArray().map(st => (
                    <tr key={st} className="hover:bg-slate-50/50">
                      <td className="p-3">{st}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                          (points[st] || 0) > 0
                            ? "bg-emerald-50 text-emerald-600"
                            : (points[st] || 0) < 0
                            ? "bg-rose-50 text-rose-600"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {points[st] || 0}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => adjustPoints(st, 1)}
                            className="p-1 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-500 transition-all"
                            title="Add Point"
                          >
                            <Plus size={13} />
                          </button>
                          <button
                            onClick={() => adjustPoints(st, -1)}
                            className="p-1 rounded bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-500 transition-all"
                            title="Subtract Point"
                          >
                            <Minus size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. QUICK POLL */}
        {activeTab === "poll" && (
          <div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Active Question
                </label>
                <input
                  type="text"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm font-bold rounded-lg border border-slate-200 focus:outline-none"
                />
              </div>
              <div className="flex flex-col justify-end">
                <button
                  onClick={startPoll}
                  disabled={isPollRunning}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 font-bold text-xs text-white rounded-lg shadow-sm flex items-center justify-center gap-1.5"
                >
                  {isPollRunning ? "Simulating Responses..." : "Launch Exit Ticket Poll"}
                </button>
              </div>
            </div>

            {/* Poll stats & charts display */}
            {Object.keys(pollResponses).length > 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 mb-4">
                  Incoming Real-time Responses ({Object.keys(pollResponses).length}/{getStudentsArray().length})
                </h4>

                <div className="space-y-3 max-w-md">
                  {Object.entries(getPollChartData()).map(([option, count]) => {
                    const total = Object.keys(pollResponses).length || 1;
                    const pct = Math.round((count / total) * 100);

                    return (
                      <div key={option} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-700">
                          <span>Option {option}</span>
                          <span>{count} votes ({pct}%)</span>
                        </div>
                        {/* Custom visual progress bar */}
                        <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${pct}%` }}
                            className={`h-full transition-all duration-500 ${
                              option === "1/4" ? "bg-emerald-500" : "bg-indigo-500"
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 font-semibold text-sm bg-white border border-slate-100 rounded-2xl">
                Setup your multiple choice question and click "Launch Exit Ticket Poll" to stream results!
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}