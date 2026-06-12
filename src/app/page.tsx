// Big Dog Math — home launcher. Playful cream-canvas theme with bright,
// labeled tiles grouped by purpose. Tiles link to each tool.
import Link from "next/link";

interface Tool { href: string; label: string; icon: string; color: string; }
interface Section { title: string; tools: Tool[]; }

const SECTIONS: Section[] = [
  {
    title: "Run the room",
    tools: [
      { href: "/control", label: "Classroom Control", icon: "🎛️", color: "#34c759" },
      { href: "/timer", label: "Timer", icon: "⏱️", color: "#f5b915" },
      { href: "/spinner", label: "Student Spinner", icon: "🎰", color: "#ff6b3d" },
      { href: "/start-question", label: "Start a Question", icon: "❓", color: "#4d8df6" },
    ],
  },
  {
    title: "Guided practice",
    tools: [
      { href: "/equation-builder", label: "Equation Builder", icon: "⚖️", color: "#22c55e" },
      { href: "/order-of-operations", label: "GEMS Order of Ops", icon: "💎", color: "#8b5cf6" },
      { href: "/combine-like-terms", label: "Combine Like Terms", icon: "🧮", color: "#ef4444" },
      { href: "/proportions", label: "Proportion Builder", icon: "🟰", color: "#ec4899" },
      { href: "/percent-bar", label: "Percent Bar", icon: "💯", color: "#f472b6" },
    ],
  },
  {
    title: "Manipulatives",
    tools: [
      { href: "/whiteboard", label: "Whiteboard", icon: "🖊️", color: "#0ea5e9" },
      { href: "/algebra-tiles", label: "Algebra Tiles", icon: "🟦", color: "#3b82f6" },
      { href: "/fraction-bars", label: "Fraction Bars", icon: "▦", color: "#14b8a6" },
      { href: "/number-line", label: "Number Line", icon: "📏", color: "#f59e0b" },
      { href: "/number-line-plus", label: "Number Line · Hops", icon: "🐸", color: "#38bdf8" },
      { href: "/group-bars", label: "Group Bars", icon: "📊", color: "#10b981" },
    ],
  },
  {
    title: "For students",
    tools: [
      { href: "/today", label: "Today's Lesson", icon: "📘", color: "#4d8df6" },
      { href: "/lessons", label: "Past Lessons", icon: "📚", color: "#8b5cf6" },
      { href: "/join", label: "Join Session", icon: "🙋", color: "#34c759" },
    ],
  },
];

export default function HomePage() {
  return (
    <main className="hp-page">
      <style>{`
        .hp-page { min-height:100vh; background:#17181c; padding:clamp(14px,3vw,40px); font-family:Inter,ui-sans-serif,system-ui,sans-serif; box-sizing:border-box; }
        .hp-panel { max-width:1080px; margin:0 auto; background:#fbf7ef; border-radius:30px; padding:clamp(24px,4vw,52px); box-shadow:0 30px 80px -30px rgba(0,0,0,0.6); }
        .hp-brandrow { display:flex; justify-content:center; margin-bottom:clamp(20px,4vw,38px); }
        .hp-pill { display:inline-flex; align-items:center; gap:10px; background:#1c1d22; color:#fff; border-radius:999px; padding:8px 8px 8px 8px; }
        .hp-logo { width:34px; height:34px; border-radius:9px; background:#ff6b3d; display:grid; place-items:center; font-weight:900; color:#fff; font-size:1.1rem; }
        .hp-pill-name { font-weight:800; font-size:0.92rem; letter-spacing:0.01em; padding-right:14px; }
        .hp-hero { text-align:center; margin-bottom:clamp(26px,5vw,46px); }
        .hp-title { font-family:Georgia,"Times New Roman",serif; font-size:clamp(2.2rem,6vw,3.6rem); font-weight:700; color:#1c1d22; margin:0; line-height:1.05; }
        .hp-sub { margin:10px 0 0; color:#7a7468; font-size:clamp(1rem,2.4vw,1.25rem); font-weight:500; }

        .hp-section { margin-bottom:clamp(22px,4vw,38px); }
        .hp-section-title { font-size:0.72rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:#a89f8c; margin:0 0 14px; }
        .hp-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(132px,1fr)); gap:clamp(12px,2vw,18px); }

        .hp-tile { display:flex; flex-direction:column; align-items:center; gap:12px; text-decoration:none; padding:18px 10px; border-radius:20px; background:#fff; border:1px solid #efe7d6; transition:transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease; }
        .hp-tile:hover { transform:translateY(-4px); box-shadow:0 14px 28px -14px rgba(0,0,0,0.35); border-color:#e2d8c2; }
        .hp-icon { width:64px; height:64px; border-radius:18px; display:grid; place-items:center; font-size:2rem; box-shadow:0 6px 0 0 rgba(0,0,0,0.12); }
        .hp-label { font-size:0.9rem; font-weight:800; color:#2a2a2e; text-align:center; line-height:1.2; }

        .hp-foot { text-align:center; margin-top:8px; color:#b3aa97; font-size:0.8rem; font-weight:600; }
      `}</style>

      <div className="hp-panel">
        <div className="hp-brandrow">
          <div className="hp-pill">
            <span className="hp-logo">B</span>
            <span className="hp-pill-name">Big Dog Math</span>
          </div>
        </div>

        <div className="hp-hero">
          <h1 className="hp-title">Big Dog Math</h1>
          <p className="hp-sub">Pick a tool to get started.</p>
        </div>

        {SECTIONS.map((sec) => (
          <section className="hp-section" key={sec.title}>
            <p className="hp-section-title">{sec.title}</p>
            <div className="hp-grid">
              {sec.tools.map((t) => (
                <Link className="hp-tile" href={t.href} key={t.href}>
                  <span className="hp-icon" style={{ background: t.color }}>{t.icon}</span>
                  <span className="hp-label">{t.label}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}

        <p className="hp-foot">Big Dog Math · classroom tools</p>
      </div>
    </main>
  );
}
