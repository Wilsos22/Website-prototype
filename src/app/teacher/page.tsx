"use client";

// Big Dog Board — teacher home base.
// Re-skinned to the "Minimal Adult UI" design system: a warm, board-first
// launchpad with a workspace nav, search, tool cards, and a Today status strip.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface Tool {
  href: string;
  label: string;
  letter: string;
  color: string;
  desc: string;
  group: "board" | "guided";
}

const TOOLS: Tool[] = [
  // Board tools (primary card grid)
  { href: "/whiteboard", label: "Whiteboard", letter: "W", color: "#50a3a4", desc: "Full-screen canvas — pen, eraser, clear", group: "board" },
  { href: "/algebra-tiles", label: "Algebra Tiles", letter: "A", color: "#2f9e6f", desc: "Expression builder — drag, group, simplify", group: "board" },
  { href: "/fraction-bars", label: "Fraction Bars", letter: "F", color: "#fcaf38", desc: "Compare fractions, decimals, and percents", group: "board" },
  { href: "/session", label: "Warm-Up Session", letter: "W", color: "#f95335", desc: "Run live forms and view student responses", group: "board" },
  { href: "/number-line-plus", label: "Number Line", letter: "N", color: "#674a40", desc: "Single or double number-line workspace", group: "board" },
  { href: "/timer", label: "Timer", letter: "T", color: "#6f675c", desc: "Large classroom countdown display", group: "board" },
  // Guided practice (compact cards)
  { href: "/equation-builder", label: "Equation Builder", letter: "E", color: "#2f9e6f", desc: "Guided solve, step by step", group: "guided" },
  { href: "/order-of-operations", label: "GEMS Order of Ops", letter: "G", color: "#7c5cd6", desc: "Pick the step, build the line", group: "guided" },
  { href: "/combine-like-terms", label: "Combine Like Terms", letter: "C", color: "#f95335", desc: "Zero pairs and simplifying", group: "guided" },
  { href: "/proportions", label: "Proportion Builder", letter: "P", color: "#50a3a4", desc: "Scale factors and missing values", group: "guided" },
  { href: "/percent-bar", label: "Percent Bar", letter: "%", color: "#cf6f9b", desc: "Parts, wholes, and benchmarks", group: "guided" },
  { href: "/area-model", label: "Area Model", letter: "A", color: "#fcaf38", desc: "Distributive property, visually", group: "guided" },
  { href: "/ladder-method", label: "Ladder Method", letter: "L", color: "#674a40", desc: "GCF, LCM, and prime factors", group: "guided" },
  { href: "/multiplication-fluency", label: "Multiplication Fluency", letter: "×", color: "#3b7fc4", desc: "Fast facts practice", group: "guided" },
  { href: "/group-bars", label: "Group Bars", letter: "G", color: "#2f9e6f", desc: "Equal groups and ratios", group: "guided" },
  { href: "/term-identifier", label: "Identify Terms", letter: "T", color: "#50a3a4", desc: "Sort coefficient, variable, operation, constant", group: "guided" },
];

const NAV: { label: string; href: string; active?: boolean }[] = [
  { label: "Home", href: "/teacher", active: true },
  { label: "Control center", href: "/control" },
  { label: "Whiteboard", href: "/whiteboard" },
  { label: "Manipulatives", href: "#manipulatives" },
  { label: "Warm-ups", href: "/session" },
  { label: "Number line", href: "/number-line-plus" },
  { label: "Timer", href: "/timer" },
  { label: "Analytics", href: "/teacher/analytics" },
  { label: "Rosters", href: "/roster" },
];

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function TeacherHome() {
  const [query, setQuery] = useState("");
  const [greeting, setGreeting] = useState("Welcome");

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
  }, []);

  const q = query.trim().toLowerCase();
  const board = useMemo(
    () => TOOLS.filter((t) => t.group === "board" && (!q || t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q))),
    [q]
  );
  const guided = useMemo(
    () => TOOLS.filter((t) => t.group === "guided" && (!q || t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q))),
    [q]
  );

  return (
    <div className="bd-home">
      <style>{`
        .bd-home { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); }
        .bd-home a { color:inherit; }

        /* Top bar */
        .bd-top { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:18px;
          padding:14px clamp(16px,3vw,32px); background:color-mix(in srgb, var(--bdb-ground) 88%, transparent);
          backdrop-filter:saturate(1.1) blur(8px); border-bottom:1px solid var(--bdb-line); }
        .bd-brand { display:flex; align-items:center; gap:10px; font-weight:700; font-size:1.06rem; letter-spacing:-0.01em; flex:none; }
        .bd-mark { width:30px; height:30px; border-radius:9px; background:var(--bdb-ink); color:var(--bdb-amber);
          display:grid; place-items:center; font-weight:800; font-size:0.95rem; }
        .bd-search { flex:1; max-width:560px; display:flex; align-items:center; gap:9px; background:var(--bdb-card);
          border:1px solid var(--bdb-line); border-radius:var(--bdb-r-pill); padding:9px 16px; box-shadow:var(--bdb-shadow-sm); }
        .bd-search input { border:none; outline:none; background:transparent; flex:1; font:inherit; color:var(--bdb-ink); }
        .bd-search input::placeholder { color:var(--bdb-ink-faint); }
        .bd-search svg { width:16px; height:16px; color:var(--bdb-ink-faint); flex:none; }
        .bd-top-spacer { flex:1; }
        .bd-present { flex:none; border:1px solid var(--bdb-line); background:var(--bdb-card); border-radius:var(--bdb-r-pill);
          padding:8px 16px; font-weight:600; font-size:0.86rem; box-shadow:var(--bdb-shadow-sm); }

        /* Body layout */
        .bd-body { display:grid; grid-template-columns:212px minmax(0,1fr); gap:clamp(16px,2.4vw,34px);
          max-width:1240px; margin:0 auto; padding:clamp(18px,3vw,34px) clamp(16px,3vw,32px) 48px; }
        .bd-nav { position:sticky; top:78px; align-self:start; display:flex; flex-direction:column; gap:2px; }
        .bd-nav-label { font-size:0.7rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;
          color:var(--bdb-ink-faint); padding:4px 12px 8px; }
        .bd-nav a { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:var(--bdb-r-sm);
          font-weight:600; font-size:0.92rem; color:var(--bdb-ink-soft); transition:background 120ms, color 120ms; }
        .bd-nav a:hover { background:color-mix(in srgb, var(--bdb-amber) 14%, transparent); color:var(--bdb-ink); }
        .bd-nav a.on { background:color-mix(in srgb, var(--bdb-amber) 26%, transparent); color:var(--bdb-ink); }
        .bd-nav a .dot { width:7px; height:7px; border-radius:50%; background:currentColor; opacity:0.4; flex:none; }
        .bd-nav a.on .dot { background:var(--bdb-amber); opacity:1; }

        .bd-main { min-width:0; }
        .bd-greet { font-size:clamp(1.7rem,3.4vw,2.3rem); font-weight:700; letter-spacing:-0.02em; margin:6px 0 4px; }
        .bd-sub { color:var(--bdb-ink-soft); font-size:1rem; margin:0 0 22px; }

        .bd-section-label { font-size:0.72rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;
          color:var(--bdb-ink-faint); margin:30px 4px 12px; }

        .bd-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(248px,1fr)); gap:14px; }
        .bd-card { display:block; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r);
          padding:18px; box-shadow:var(--bdb-shadow-sm); transition:transform 130ms ease, box-shadow 130ms ease, border-color 130ms; }
        .bd-card:hover { transform:translateY(-2px); box-shadow:var(--bdb-shadow); border-color:color-mix(in srgb, var(--c,#674a40) 40%, var(--bdb-line)); }
        .bd-tile { width:42px; height:42px; border-radius:11px; display:grid; place-items:center; font-weight:800; font-size:1.05rem;
          background:color-mix(in srgb, var(--c) 16%, white); color:color-mix(in srgb, var(--c) 80%, black); margin-bottom:14px; }
        .bd-card h3 { margin:0 0 4px; font-size:1.08rem; font-weight:700; letter-spacing:-0.01em; }
        .bd-card p { margin:0 0 12px; font-size:0.88rem; color:var(--bdb-ink-soft); line-height:1.35; }
        .bd-open { font-size:0.86rem; font-weight:700; color:var(--c); display:inline-flex; align-items:center; gap:5px; }

        .bd-grid.compact { grid-template-columns:repeat(auto-fill, minmax(210px,1fr)); }
        .bd-card.compact { display:flex; align-items:center; gap:12px; padding:13px 14px; }
        .bd-card.compact .bd-tile { width:34px; height:34px; border-radius:9px; font-size:0.92rem; margin:0; }
        .bd-card.compact h3 { font-size:0.96rem; margin:0; }
        .bd-card.compact p { display:none; }

        /* Today strip */
        .bd-today { margin-top:30px; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg);
          padding:18px 20px; box-shadow:var(--bdb-shadow-sm); border-left:5px solid var(--bdb-amber); }
        .bd-today h4 { margin:0 0 4px; font-size:1.02rem; font-weight:700; }
        .bd-today .bd-today-sub { margin:0 0 12px; color:var(--bdb-ink-soft); font-size:0.9rem; }
        .bd-chips { display:flex; flex-wrap:wrap; gap:8px; }
        .bd-chip { display:inline-flex; align-items:center; gap:7px; padding:6px 13px; border-radius:var(--bdb-r-pill);
          font-size:0.82rem; font-weight:600; background:var(--bdb-ground-2); color:var(--bdb-ink-soft); }
        .bd-chip .cdot { width:8px; height:8px; border-radius:50%; flex:none; }

        .bd-empty { color:var(--bdb-ink-faint); font-size:0.92rem; padding:8px 4px; }

        @media (max-width:760px) {
          .bd-body { grid-template-columns:1fr; }
          .bd-nav { position:static; flex-direction:row; flex-wrap:wrap; gap:6px; }
          .bd-nav-label { display:none; }
          .bd-present { display:none; }
        }
      `}</style>

      <header className="bd-top">
        <div className="bd-brand">
          <span className="bd-mark">b</span>
          <span>bigdogmath</span>
        </div>
        <div className="bd-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lessons, tools, students…"
            aria-label="Search tools"
          />
        </div>
        <div className="bd-top-spacer" />
        <Link href="/control" className="bd-present">Present →</Link>
      </header>

      <div className="bd-body">
        <nav className="bd-nav" aria-label="Workspace">
          <div className="bd-nav-label">Workspace</div>
          {NAV.map((n) => (
            <Link key={n.label} href={n.href} className={n.active ? "on" : ""}>
              <span className="dot" />
              {n.label}
            </Link>
          ))}
        </nav>

        <main className="bd-main">
          <h1 className="bd-greet">{greeting}, Mr. Wilson</h1>
          <p className="bd-sub">Pick a board tool, or jump back into this week&apos;s warm-ups.</p>

          <div className="bd-grid">
            {board.length === 0 ? (
              <div className="bd-empty">No board tools match “{query}”.</div>
            ) : (
              board.map((t) => (
                <Link key={t.href} href={t.href} className="bd-card" style={{ ["--c" as string]: t.color }}>
                  <span className="bd-tile">{t.letter}</span>
                  <h3>{t.label}</h3>
                  <p>{t.desc}</p>
                  <span className="bd-open">Open →</span>
                </Link>
              ))
            )}
          </div>

          <h2 className="bd-section-label" id="manipulatives">Guided practice</h2>
          <div className="bd-grid compact">
            {guided.length === 0 ? (
              <div className="bd-empty">No guided tools match “{query}”.</div>
            ) : (
              guided.map((t) => (
                <Link key={t.href} href={t.href} className="bd-card compact" style={{ ["--c" as string]: t.color }}>
                  <span className="bd-tile">{t.letter}</span>
                  <h3>{t.label}</h3>
                </Link>
              ))
            )}
          </div>

          <section className="bd-today">
            <h4>Today</h4>
            <p className="bd-today-sub">Warm-up forms ready · Display mode active · Student response session idle</p>
            <div className="bd-chips">
              <span className="bd-chip"><span className="cdot" style={{ background: "var(--bdb-green)" }} />Warm-up ready</span>
              <span className="bd-chip"><span className="cdot" style={{ background: "var(--bdb-teal)" }} />Responses 0</span>
              <span className="bd-chip"><span className="cdot" style={{ background: "var(--bdb-coral)" }} />Timer 05:00</span>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
