// Student Explore hub — own-time browsing. The practice tools, free to use.
// Reached from the landing's "Just looking around?" link. No class link here;
// to follow the teacher's screen, students join with a code on the home page.

import StudentAssignments from "@/components/StudentAssignments";

type Tool = { href: string; label: string; letter: string; color: string; desc: string };

const TOOLS: Tool[] = [
  { href: "/number-line-plus", label: "Number Line", letter: "N", color: "#674a40", desc: "Integers, hops, and fractions" },
  { href: "/coordinate-grid", label: "Coordinate Grid", letter: "+", color: "#4d8df6", desc: "Plot and identify points" },
  { href: "/percent-bar", label: "Percent Bar", letter: "%", color: "#50a3a4", desc: "Parts, wholes, and benchmarks" },
  { href: "/fraction-bars", label: "Fraction Bars", letter: "F", color: "#fcaf38", desc: "Fractions, decimals, percents" },
  { href: "/group-bars", label: "Group Bars", letter: "G", color: "#2f9e6f", desc: "Equal groups and ratios" },
  { href: "/proportions", label: "Proportions", letter: "P", color: "#50a3a4", desc: "Scale factors and missing values" },
  { href: "/equation-builder", label: "Equation Builder", letter: "E", color: "#2f9e6f", desc: "Solve step by step" },
  { href: "/order-of-operations", label: "GEMS Order of Ops", letter: "G", color: "#7c5cd6", desc: "Pick the step, build the line" },
  { href: "/combine-like-terms", label: "Combine Like Terms", letter: "C", color: "#f95335", desc: "Group and simplify" },
  { href: "/term-identifier", label: "Identify Terms", letter: "T", color: "#50a3a4", desc: "Coefficient, variable, constant" },
  { href: "/area-model", label: "Area Model", letter: "A", color: "#fcaf38", desc: "Multiply with rectangles" },
  { href: "/ladder-method", label: "Ladder Method", letter: "L", color: "#674a40", desc: "GCF, LCM, prime factors" },
  { href: "/algebra-tiles", label: "Algebra Tiles", letter: "A", color: "#2f9e6f", desc: "Build and simplify expressions" },
  { href: "/multiplication-fluency", label: "Multiplication Facts", letter: "×", color: "#4d8df6", desc: "Fast facts practice" },
];

export default function ExplorePage() {
  return (
    <main className="ex-root">
      <style>{`
        .ex-root { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); }
        .ex-top { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;
          padding:14px clamp(16px,4vw,28px); border-bottom:1px solid var(--bdb-line); }
        .ex-brand { display:inline-flex; align-items:center; gap:9px; text-decoration:none; }
        .ex-logo { width:30px; height:30px; display:block; object-fit:contain; flex:none; }
        .ex-brand-name { font-weight:800; color:var(--bdb-ink); letter-spacing:-0.01em; }
        .ex-back { color:var(--bdb-ink-soft); font-weight:600; font-size:0.9rem; text-decoration:none;
          border:1px solid var(--bdb-line); border-radius:999px; padding:8px 14px; background:var(--bdb-card); }
        .ex-back:hover { border-color:var(--bdb-teal); color:var(--bdb-ink); }

        .ex-wrap { max-width:960px; margin:0 auto; padding:clamp(18px,4vw,34px) 16px; }
        .ex-h1 { margin:0 0 4px; font-size:clamp(1.6rem,4.5vw,2.4rem); font-weight:800; letter-spacing:-0.02em; }
        .ex-sub { margin:0 0 20px; color:var(--bdb-ink-soft); font-weight:500; font-size:1rem; }
        .ex-h2 { margin:26px 0 12px; font-size:0.82rem; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:var(--bdb-ink-faint); }

        .ex-lesson { display:flex; align-items:center; gap:16px; text-decoration:none; border:none; border-radius:var(--bdb-r-lg);
          background:var(--bdb-coral); color:#fff; padding:20px 22px; box-shadow:0 16px 30px -18px rgba(249,83,53,0.7); }
        .ex-lesson:hover { filter:brightness(1.03); }
        .ex-lesson-ico { width:52px; height:52px; flex:none; border-radius:13px; background:rgba(255,255,255,0.22);
          display:grid; place-items:center; }
        .ex-lesson-ico svg { width:28px; height:28px; }
        .ex-lesson-label { display:block; font-size:1.2rem; font-weight:800; letter-spacing:-0.01em; }
        .ex-lesson-desc { display:block; font-size:0.9rem; font-weight:500; color:rgba(255,255,255,0.92); margin-top:2px; }
        .ex-lesson-go { margin-left:auto; font-size:1.6rem; font-weight:800; }

        .ex-games { display:flex; align-items:center; gap:16px; text-decoration:none; border:none; border-radius:var(--bdb-r-lg);
          background:var(--bdb-teal); color:#fff; padding:18px 22px; margin-top:14px; box-shadow:0 16px 30px -18px rgba(80,163,164,0.7); }
        .ex-games:hover { filter:brightness(1.03); }
        .ex-games-ico { width:52px; height:52px; flex:none; border-radius:13px; background:rgba(255,255,255,0.22);
          display:grid; place-items:center; font-size:1.7rem; }

        .ex-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:14px; }
        .ex-card { display:flex; align-items:center; gap:14px; text-decoration:none; background:var(--bdb-card);
          border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:16px; box-shadow:var(--bdb-shadow-sm);
          transition:transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease; }
        .ex-card:hover { transform:translateY(-2px); box-shadow:var(--bdb-shadow); }
        .ex-badge { width:46px; height:46px; border-radius:12px; flex:none; display:grid; place-items:center;
          color:#fff; font-weight:800; font-size:1.25rem; }
        .ex-c-label { display:block; font-weight:700; color:var(--bdb-ink); letter-spacing:-0.01em; }
        .ex-c-desc { display:block; font-size:0.84rem; color:var(--bdb-ink-soft); font-weight:500; margin-top:2px; }
      `}</style>

      <header className="ex-top">
        <a className="ex-brand" href="/explore">
          <img className="ex-logo" src="/big-dog-mark.png" alt="" />
          <span className="ex-brand-name">bigdogmath</span>
        </a>
        <a className="ex-back" href="/">← Join a class</a>
      </header>

      <div className="ex-wrap">
        <h1 className="ex-h1">Explore</h1>
        <p className="ex-sub">Catch up on a lesson, or practice any tool — no code needed.</p>

        <a className="ex-lesson" href="/lesson">
          <span className="ex-lesson-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3 h9 l4 4 v14 H6 Z" /><path d="M15 3 v4 h4" /><line x1="9" y1="13" x2="16" y2="13" /><line x1="9" y1="17" x2="16" y2="17" /></svg>
          </span>
          <span>
            <span className="ex-lesson-label">Today&apos;s Lesson</span>
            <span className="ex-lesson-desc">Warm-up, agenda, and today&apos;s work</span>
          </span>
          <span className="ex-lesson-go" aria-hidden="true">→</span>
        </a>

        <a className="ex-games" href="/practice">
          <span className="ex-games-ico">🎮</span>
          <span>
            <span className="ex-lesson-label">Practice Games</span>
            <span className="ex-lesson-desc">Beat your score — GEMS, integers, percents & more</span>
          </span>
          <span className="ex-lesson-go" aria-hidden="true">→</span>
        </a>

        <StudentAssignments />

        <h2 className="ex-h2">Math tools</h2>
        <div className="ex-grid">
          {TOOLS.map((t) => (
            <a key={t.href} className="ex-card" href={t.href}>
              <span className="ex-badge" style={{ background: t.color }}>{t.letter}</span>
              <span>
                <span className="ex-c-label">{t.label}</span>
                <span className="ex-c-desc">{t.desc}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}
