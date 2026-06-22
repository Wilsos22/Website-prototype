"use client";

// Soft PIN gate for the teacher area. Renders its children once unlocked
// (remembered on this device via localStorage); otherwise shows a PIN prompt.
// Wrap a route by adding a layout.tsx that returns <TeacherGate>{children}</TeacherGate>.

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { isTeacherUnlocked, tryUnlockTeacher } from "@/lib/teacherAuth";

export default function TeacherGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    setUnlocked(isTeacherUnlocked());
    setReady(true);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (tryUnlockTeacher(pin)) {
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setPin("");
    }
  }

  if (!ready) return null;
  if (unlocked) return <>{children}</>;

  return (
    <main className="tg-wrap">
      <style>{`
        .tg-wrap {
          min-height:100vh; display:grid; place-items:center; padding:24px;
          background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink);
        }
        .tg-card {
          width:min(380px,100%); background:var(--bdb-card); border:1px solid var(--bdb-line);
          border-radius:var(--bdb-r-lg); padding:clamp(22px,5vw,32px); display:grid; gap:14px;
          box-shadow:var(--bdb-shadow); text-align:center;
        }
        .tg-mark { width:46px; height:46px; margin:0 auto; border-radius:13px; background:var(--bdb-ink);
          color:var(--bdb-amber); display:grid; place-items:center; font-weight:800; font-size:1.3rem; }
        .tg-title { margin:0; font-size:1.3rem; font-weight:800; letter-spacing:-0.01em; }
        .tg-sub { margin:0; color:var(--bdb-ink-soft); font-size:0.92rem; font-weight:500; }
        .tg-form { display:flex; gap:8px; margin-top:4px; }
        .tg-input {
          flex:1; min-width:0; border:2px solid var(--bdb-line); border-radius:12px; padding:12px 14px;
          font-family:inherit; font-size:1.1rem; font-weight:700; letter-spacing:0.14em; text-align:center;
          color:var(--bdb-ink); background:var(--bdb-ground);
        }
        .tg-input:focus { outline:none; border-color:var(--bdb-teal); }
        .tg-input.err { border-color:var(--bdb-coral); }
        .tg-go {
          border:none; border-radius:12px; padding:0 20px; background:var(--bdb-coral); color:#fff;
          font-family:inherit; font-weight:800; cursor:pointer;
        }
        .tg-err { color:var(--bdb-coral); font-weight:600; font-size:0.86rem; min-height:1.1em; }
        .tg-back { color:var(--bdb-ink-faint); font-size:0.82rem; font-weight:600; text-decoration:none; }
        .tg-back:hover { color:var(--bdb-ink-soft); }
      `}</style>
      <form className="tg-card" onSubmit={submit}>
        <span className="tg-mark">b</span>
        <h1 className="tg-title">Teacher access</h1>
        <p className="tg-sub">Enter the teacher PIN to open the control area.</p>
        <div className="tg-form">
          <input
            className={`tg-input${error ? " err" : ""}`}
            type="password"
            inputMode="text"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(false); }}
            placeholder="PIN"
            autoFocus
            aria-label="Teacher PIN"
          />
          <button className="tg-go" type="submit">Enter</button>
        </div>
        <div className="tg-err">{error ? "That PIN didn't match. Try again." : ""}</div>
        <a className="tg-back" href="/">← Back to student home</a>
      </form>
    </main>
  );
}
