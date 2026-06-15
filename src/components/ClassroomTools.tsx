import React, { useState, useEffect, useRef } from "react";

export default function ClassroomTools() {
  const [timeLeft, setTimeLeft] = useState<number>(310); // 5 mins 10 secs to test 5:00 transition easily
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [view, setView] = useState<"timer" | "exit">("timer");
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Core Timer Logic
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsRunning(false);
            setView("exit");
            return 0;
          }
          const nextTime = prev - 1;
          // Trigger Abbie Toast at exactly 5:00 (300 seconds)
          if (nextTime === 300) {
            setShowToast(true);
          }
          return nextTime;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // Audio volume controller
  useEffect(() => {
    if (view === "exit" && audioRef.current) {
      audioRef.current.volume = 0.3;
      audioRef.current.play().catch((err) => {
        console.log("Autoplay blocked by browser. User interaction needed to play audio.", err);
      });
    }
  }, [view]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePreset = (seconds: number) => {
    setIsRunning(false);
    setTimeLeft(seconds);
    setShowToast(false);
    setView("timer");
  };

  const togglePlayPause = () => {
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(310);
    setShowToast(false);
    setView("timer");
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-start font-sans relative overflow-hidden">
      
      {/* Abbie Cleanup Notification Toast */}
      {showToast && (
        <div className="fixed top-20 right-6 z-50 bg-gradient-to-r from-amber-500 to-orange-600 border border-amber-400 p-4 rounded-2xl shadow-2xl flex items-center gap-4 max-w-sm animate-bounce">
          <img
            src="/abbie-celebrating.png"
            alt="Mascot Abbie"
            className="w-12 h-12 object-contain bg-white/20 rounded-full p-1 flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://placekitten.com/80/80";
            }}
          />
          <div className="text-white text-xs">
            <span className="font-extrabold text-white text-sm block">⏰ Cleanup Warning!</span>
            "Hey class! We've hit the 5-minute mark! Start packing up your materials soon."
          </div>
          <button
            onClick={() => setShowToast(false)}
            className="text-white font-bold bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-[10px]"
          >
            Got it!
          </button>
        </div>
      )}

      {view === "timer" ? (
        <div className="w-full max-w-2xl flex flex-col items-center justify-center gap-6 mt-10">
          <div className="text-center">
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Classroom Timer Mode
            </span>
            <h1 className="text-4xl font-extrabold mt-3">Interactive Lesson Clock</h1>
            <p className="text-slate-400 text-xs mt-1">Keep lesson paces visual and automatic.</p>
          </div>

          {/* Large Countdown timer display */}
          <div className="bg-slate-950/80 border border-slate-800 p-12 rounded-3xl text-center w-full shadow-2xl flex flex-col items-center justify-center relative">
            <span className="text-8xl font-black font-mono tracking-widest bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
              {formatTime(timeLeft)}
            </span>

            {/* Quick Presets for Demo & Testing */}
            <div className="flex gap-2 flex-wrap justify-center mt-8">
              <button
                onClick={() => handlePreset(310)}
                className="bg-slate-900 hover:bg-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-slate-800 transition"
              >
                5:10 (Test 5:00 warning)
              </button>
              <button
                onClick={() => handlePreset(5)}
                className="bg-slate-900 hover:bg-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-slate-800 transition"
              >
                0:05 (Test 0:00 transition)
              </button>
              <button
                onClick={() => handlePreset(600)}
                className="bg-slate-900 hover:bg-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-slate-800 transition"
              >
                10 Minutes
              </button>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlayPause}
              className={`px-8 py-3 rounded-xl font-bold text-sm border shadow-lg transition ${
                isRunning
                  ? "bg-amber-600/20 border-amber-500 text-amber-300"
                  : "bg-emerald-600/20 border-emerald-500 text-emerald-300"
              }`}
            >
              {isRunning ? "Pause Timer" : "Start Timer"}
            </button>
            <button
              onClick={handleReset}
              className="bg-slate-800 hover:bg-slate-700 px-6 py-3 rounded-xl border border-slate-700 text-sm font-semibold transition"
            >
              Reset
            </button>
          </div>
        </div>
      ) : (
        /* EXIT PROCEDURE DASHBOARD SCREEN */
        <div className="w-full max-w-3xl flex flex-col items-center justify-center mt-4 animate-scale-up z-10">
          
          {/* Loopable Audio Element */}
          <audio
            ref={audioRef}
            src="/audio/lofi-exit.mp3"
            loop
            preload="auto"
          />

          <div className="text-center mb-8">
            <span className="bg-pink-500/20 text-pink-300 border border-pink-500/30 text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-widest animate-pulse">
              🚨 Time is Up! Exit Mode Activated
            </span>
            <h1 className="text-4xl font-black mt-4 bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-rose-400">
              Exit Procedure Dashboard
            </h1>
            <p className="text-slate-400 text-xs mt-1">Follow these 4 steps to transition smoothly to your next class.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
            {/* Steps Left Panel */}
            <div className="bg-slate-950/80 border border-slate-800 p-6 rounded-3xl shadow-2xl flex flex-col gap-4">
              <h3 className="text-xs font-extrabold text-pink-400 uppercase tracking-wider mb-2">📋 Transition Checklist</h3>
              
              {[
                { step: "1", title: "Clear Desk", desc: "Brush all crumbs, papers, and trash into the bin." },
                { step: "2", title: "Return Device to Cart Slot", desc: "Plug in the charger cable and check for the green charging light." },
                { step: "3", title: "Return Materials", desc: "Place all algebra tiles, fraction segments, and notebooks in their bins." },
                { step: "4", title: "Stand by Desk", desc: "Push in your chair and wait quietly for dismissal." }
              ].map((s) => (
                <div key={s.step} className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl flex items-center gap-4 transition group">
                  <div className="bg-pink-600/20 text-pink-300 font-extrabold text-sm w-8 h-8 rounded-full border border-pink-500/30 flex items-center justify-center flex-shrink-0 group-hover:bg-pink-500 group-hover:text-white transition">
                    {s.step}
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-white">{s.title}</h4>
                    <p className="text-[11px] text-slate-400 leading-normal">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Media/Lofi Status and Return Panel */}
            <div className="bg-slate-950/80 border border-slate-800 p-6 rounded-3xl shadow-2xl flex flex-col justify-between items-center text-center gap-6">
              
              {/* Audio controller */}
              <div className="w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-left">
                  <span className="text-pink-400 animate-spin text-lg">🎵</span>
                  <div>
                    <span className="text-xs font-extrabold text-white block">Playing: Ambient Lofi Exit</span>
                    <span className="text-[10px] text-slate-400 block">Volume: 30% soft background</span>
                  </div>
                </div>
                <button
                  onClick={toggleMute}
                  className="bg-slate-800 hover:bg-slate-700 text-[10px] font-bold px-3 py-1.5 rounded-xl border border-slate-700 transition"
                >
                  {isMuted ? "🔈 Unmute" : "🔇 Mute"}
                </button>
              </div>

              {/* Coach Mascot illustration */}
              <div className="flex flex-col items-center">
                <img
                  src="/abbie-celebrating.png"
                  alt="Mascot Abbie celebrating"
                  className="w-24 h-24 object-contain bg-white/5 rounded-full p-2 mb-2 animate-bounce"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "https://placekitten.com/150/150";
                  }}
                />
                <span className="text-xs font-bold text-pink-400 block mb-1">Abbie Says:</span>
                <p className="text-[11px] text-slate-300 leading-relaxed max-w-xs">
                  "Awesome work today class! Let's get our desks perfectly organized so the next group has a clean workspace."
                </p>
              </div>

              {/* Return to clock button */}
              <button
                onClick={handleReset}
                className="w-full bg-slate-900 hover:bg-slate-800 text-xs font-bold border border-slate-800 py-3 rounded-2xl transition"
              >
                Reset & Return to Class Timer
              </button>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
