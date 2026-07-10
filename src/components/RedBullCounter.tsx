"use client";

// Red Bull counter - the running class gag made real. It's a strict no-food,
// no-drink room, yet dad roams around sipping Red Bulls. Tap +1 each time he
// cracks one; Abbie clocks the hypocrisy and roasts him for the class. The tally
// lives on this device and resets each day. Teacher-triggered, so it only
// fires when he taps it. Only useful inside the control panel (where an Abbie
// console is mounted to react); harmless elsewhere.

import { useEffect, useState } from "react";
import { requestAbbieLine } from "@/lib/abbieBus";

const LS_KEY = "bdm-redbull-v1";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default function RedBullCounter() {
  const [count, setCount] = useState(0);

  // Load today's tally; a new day starts back at zero.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { date: string; count: number };
        if (saved.date === today() && typeof saved.count === "number") setCount(saved.count);
      }
    } catch { /* ignore */ }
  }, []);

  function bump() {
    const next = count + 1;
    setCount(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify({ date: today(), count: next })); } catch { /* ignore */ }
    requestAbbieLine(`Dad just cracked open Red Bull number ${next} of the day - in his own strict no-food, no-drink room, while the kids can't even have a Takis. Clock the hypocrisy and roast him for the class. One line.`);
  }

  return (
    <>
      <style>{`
        .rbc { position:fixed; left:18px; bottom:18px; z-index:68; display:flex; align-items:center; gap:8px; border:1px solid #2a241a; border-radius:999px; background:#16120c; color:#d8d2c5; padding:7px 8px 7px 14px; box-shadow:0 8px 24px rgba(0,0,0,0.4); }
        .rbc-label { font-size:0.76rem; font-weight:800; color:#a39a88; letter-spacing:0.02em; }
        .rbc-count { font-size:0.9rem; font-weight:950; color:#fcaf38; min-width:1ch; text-align:center; }
        .rbc-bump { border:1px solid #34301f; background:#1a160f; color:#efe9df; border-radius:999px; width:28px; height:28px; font-weight:950; font-size:1rem; line-height:1; cursor:pointer; }
        .rbc-bump:hover { border-color:#fcaf38; color:#fff; }
      `}</style>
      <div className="rbc" title="Tap when dad cracks another Red Bull">
        <span className="rbc-label">Dad&apos;s Red Bulls today</span>
        <span className="rbc-count">{count}</span>
        <button className="rbc-bump" onClick={bump} aria-label="Add a Red Bull">+</button>
      </div>
    </>
  );
}
