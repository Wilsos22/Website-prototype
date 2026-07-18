"use client";

// The one teacher login. Password only; success sets a cookie that remembers
// this device for ~6 months, then sends you where you were headed.

import { useEffect, useState } from "react";

const NOT_CONFIGURED =
  "This deployment can't see TEACHER_PASSWORD, so the teacher area can't unlock — no password will work. " +
  "On Vercel, check that the variable is enabled for this environment (Production AND Preview); locally, set it in .env.local. Then redeploy/restart.";

export default function TeacherLogin() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The proxy redirects here with ?error=configuration when the deployment has
  // no TEACHER_PASSWORD. Surface that loudly — otherwise login "succeeds" and
  // bounces straight back here, which reads as a wrong password.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "configuration") {
      setError(NOT_CONFIGURED);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { setError(d.error || "Login failed."); setBusy(false); return; }
      if (d.note) { setError(NOT_CONFIGURED); setBusy(false); return; } // no password configured — don't redirect into the bounce loop
      const next = new URLSearchParams(window.location.search).get("next");
      const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/teacher";
      window.location.href = safe;
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  }

  return (
    <main className="tl-wrap">
      <style>{`
        .tl-wrap { min-height: 100vh; display: grid; place-items: center; background: #fbf7ef; padding: 24px; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
        .tl-card { width: min(380px, 100%); background: #fff; border: 1px solid #efe8d8; border-radius: 20px; padding: 32px 28px; text-align: center; box-shadow: 0 10px 30px rgba(60,50,30,0.08); }
        .tl-mark { width: 64px; height: 64px; object-fit: contain; margin: 0 auto 10px; display: block; }
        .tl-title { font-family: Georgia, serif; font-size: 1.5rem; color: #2b2620; margin: 0 0 4px; }
        .tl-sub { color: #7a7264; font-size: 0.9rem; margin: 0 0 18px; }
        .tl-form { display: flex; gap: 8px; }
        .tl-in { flex: 1; min-width: 0; border: 2px solid #e7dec9; border-radius: 12px; padding: 12px 14px; font: inherit; font-size: 1.05rem; background: #fbf7ef; color: #2b2620; }
        .tl-in:focus { outline: none; border-color: #14b8a6; }
        .tl-go { border: none; border-radius: 12px; padding: 0 20px; background: #14b8a6; color: #fff; font-weight: 800; font-size: 1rem; cursor: pointer; }
        .tl-go:disabled { opacity: 0.6; }
        .tl-err { color: #c0392b; font-weight: 700; font-size: 0.88rem; min-height: 18px; margin-top: 10px; }
        .tl-note { color: #a99f8c; font-size: 0.78rem; margin-top: 14px; }
      `}</style>
      <div className="tl-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="tl-mark" src="/big-dog-logo.png" alt="Big Dog Math" />
        <h1 className="tl-title">Teacher login</h1>
        <p className="tl-sub">Students don&apos;t need this — lesson pages are open.</p>
        <form className="tl-form" onSubmit={submit}>
          <input
            className="tl-in" type="password" placeholder="Password" value={password}
            autoFocus autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="tl-go" disabled={busy || !password}>{busy ? "…" : "Let's go"}</button>
        </form>
        <div className="tl-err">{error}</div>
        <div className="tl-note">This device stays signed in for about 6 months.</div>
      </div>
    </main>
  );
}
