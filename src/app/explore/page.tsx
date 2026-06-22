// Student Explore hub — own-time browsing. The practice tools, free to use.
// Reached from the landing's "Just looking around?" link. No class link here;
// to follow the teacher's screen, students join with a code on the home page.

type Tool = { href: string; label: string; letter: string; color: string; desc: string };

const TOOLS: Tool[] = [
  { href: "/number-line-plus", label: "Number Line", letter: "N", color: "#674a40", desc: "Integers, hops, and fractions" },
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
        .ex-logo { width:28px; height:28px; border-radius:8px; background:var(--bdb-ink); color:var(--bdb-amber);
          display:grid; place-items:center; font-weight:800; font-size:0.9rem; }
        .ex-brand-name { font-weight:800; color:var(--bdb-ink); letter-spacing:-0.01em; }
        .ex-back { color:var(--bdb-ink-soft); font-weight:600; font-size:0.9rem; text-decoration:none;
          border:1px solid var(--bdb-line); border-radius:999px; padding:8px 14px; background:var(--bdb-card); }
        .ex-back:hover { border-color:var(--bdb-teal); color:var(--bdb-ink); }

        .ex-wrap { max-width:960px; margin:0 auto; padding:clamp(18px,4vw,34px) 16px; }
        .ex-h1 { margin:0 0 4px; font-size:clamp(1.6rem,4.5vw,2.4rem); font-weight:800; letter-spacing:-0.02em; }
        .ex-sub { margin:0 0 22px; color:var(--bdb-ink-soft); font-weight:500; font-size:1rem; }

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
          <span className="ex-logo">b</span>
          <span className="ex-brand-name">bigdogmath</span>
        </a>
        <a className="ex-back" href="/">← Join a class</a>
      </header>

      <div className="ex-wrap">
        <h1 className="ex-h1">Math tools</h1>
        <p className="ex-sub">Practice anything you want — no code needed.</p>

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
