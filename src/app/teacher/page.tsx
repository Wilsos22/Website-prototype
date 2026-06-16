// Big Dog Math — home launcher. Playful cream-canvas theme with bright,
// labeled tiles using big, minimal line icons. Tiles link to each tool.
import Link from "next/link";

type IconKey =
  | "control" | "timer" | "spinner" | "question"
  | "equation" | "gems" | "combine" | "proportion" | "percent" | "area"
  | "whiteboard" | "algebra" | "fraction" | "numberline" | "hops" | "groupbars"
  | "today" | "lessons" | "join" | "analytics";

interface Tool { href: string; label: string; icon: IconKey; color: string; }
interface Section { title: string; tools: Tool[]; }

const SECTIONS: Section[] = [
  {
    title: "Run the room",
    tools: [
      { href: "/control", label: "Classroom Control", icon: "control", color: "#34c759" },
      { href: "/timer", label: "Timer", icon: "timer", color: "#f5b915" },
      { href: "/spinner", label: "Student Spinner", icon: "spinner", color: "#ff6b3d" },
      { href: "/start-question", label: "Start a Question", icon: "question", color: "#4d8df6" },
      { href: "/teacher/analytics", label: "Form Analytics", icon: "analytics", color: "#6366f1" },
      { href: "/roster", label: "Rosters", icon: "join", color: "#10b981" },
      { href: "/session", label: "Live Session", icon: "join", color: "#14b8a6" },
    ],
  },
  {
    title: "Guided practice",
    tools: [
      { href: "/equation-builder", label: "Equation Builder", icon: "equation", color: "#22c55e" },
      { href: "/order-of-operations", label: "GEMS Order of Ops", icon: "gems", color: "#8b5cf6" },
      { href: "/combine-like-terms", label: "Combine Like Terms", icon: "combine", color: "#ef4444" },
      { href: "/proportions", label: "Proportion Builder", icon: "proportion", color: "#ec4899" },
      { href: "/percent-bar", label: "Percent Bar", icon: "percent", color: "#f472b6" },
      { href: "/area-model", label: "Area Model", icon: "area", color: "#f97316" },
    ],
  },
  {
    title: "Manipulatives",
    tools: [
      { href: "/whiteboard", label: "Whiteboard", icon: "whiteboard", color: "#0ea5e9" },
      { href: "/algebra-tiles", label: "Algebra Tiles", icon: "algebra", color: "#3b82f6" },
      { href: "/fraction-bars", label: "Fraction Bars", icon: "fraction", color: "#14b8a6" },
      { href: "/number-line", label: "Number Line", icon: "numberline", color: "#f59e0b" },
      { href: "/number-line-plus", label: "Number Line · Hops", icon: "hops", color: "#38bdf8" },
      { href: "/group-bars", label: "Group Bars", icon: "groupbars", color: "#10b981" },
    ],
  },
  {
    title: "For students",
    tools: [
      { href: "/today", label: "Today's Lesson", icon: "today", color: "#4d8df6" },
      { href: "/lessons", label: "Past Lessons", icon: "lessons", color: "#8b5cf6" },
      { href: "/join", label: "Join Session", icon: "join", color: "#34c759" },
    ],
  },
];

function Icon({ name }: { name: IconKey }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "control": return <svg viewBox="0 0 24 24" {...p}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /><circle cx="9" cy="7" r="2.4" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2.4" fill="currentColor" stroke="none" /><circle cx="8" cy="17" r="2.4" fill="currentColor" stroke="none" /></svg>;
    case "timer": return <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="13" r="8" /><path d="M12 13 V8" /><line x1="9" y1="2.5" x2="15" y2="2.5" /></svg>;
    case "spinner": return <svg viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="8" /><path d="M12 4 l2.5 4 h-5 Z" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></svg>;
    case "question": return <svg viewBox="0 0 24 24" {...p}><path d="M5 5 h14 a1 1 0 0 1 1 1 v9 a1 1 0 0 1 -1 1 H10 l-4 4 v-4 H5 a1 1 0 0 1 -1 -1 V6 a1 1 0 0 1 1 -1 Z" /><path d="M9.5 9.5 a2.5 2.5 0 1 1 3.4 2.3 c-0.8 0.4 -0.9 0.9 -0.9 1.7" /><circle cx="12" cy="15.6" r="0.6" fill="currentColor" stroke="none" /></svg>;
    case "analytics": return <svg viewBox="0 0 24 24" {...p}><line x1="4" y1="20" x2="20" y2="20" /><rect x="6" y="11" width="3" height="7" rx="1" fill="currentColor" stroke="none" /><rect x="11" y="6" width="3" height="12" rx="1" fill="currentColor" stroke="none" /><rect x="16" y="9" width="3" height="9" rx="1" fill="currentColor" stroke="none" /></svg>;
    case "equation": return <svg viewBox="0 0 24 24" {...p}><line x1="12" y1="4" x2="12" y2="20" /><line x1="5" y1="7" x2="19" y2="7" /><path d="M5 7 L3 12 h4 Z" /><path d="M19 7 L17 12 h4 Z" /><line x1="8" y1="20" x2="16" y2="20" /></svg>;
    case "gems": return <svg viewBox="0 0 24 24" {...p}><path d="M12 3 L21 10 L12 21 L3 10 Z" /><path d="M3 10 H21" /><path d="M9 10 L12 21" /><path d="M15 10 L12 21" /></svg>;
    case "combine": return <svg viewBox="0 0 24 24" {...p}><circle cx="8" cy="12" r="4.5" /><circle cx="16" cy="12" r="4.5" /><line x1="12" y1="9.5" x2="12" y2="14.5" /><line x1="9.6" y1="12" x2="14.4" y2="12" /></svg>;
    case "proportion": return <svg viewBox="0 0 24 24" {...p}><circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" /><circle cx="8" cy="16" r="1.4" fill="currentColor" stroke="none" /><line x1="13" y1="6" x2="13" y2="18" /><circle cx="17.5" cy="9" r="1.4" fill="currentColor" stroke="none" /><circle cx="17.5" cy="15" r="1.4" fill="currentColor" stroke="none" /></svg>;
    case "percent": return <svg viewBox="0 0 24 24" {...p}><line x1="6" y1="18" x2="18" y2="6" /><circle cx="7.5" cy="7.5" r="2.2" /><circle cx="16.5" cy="16.5" r="2.2" /></svg>;
    case "area": return <svg viewBox="0 0 24 24" {...p}><rect x="4" y="5" width="16" height="14" rx="1.5" /><line x1="13" y1="5" x2="13" y2="19" /><line x1="4" y1="12" x2="20" y2="12" /><path d="M7 8 h3" /><path d="M15.5 8 h1.5" /><path d="M7 16 h3" /><path d="M15.5 16 h1.5" /></svg>;
    case "whiteboard": return <svg viewBox="0 0 24 24" {...p}><rect x="3" y="4" width="18" height="13" rx="2" /><line x1="12" y1="20" x2="12" y2="17" /><path d="M8 13 l3 -5 l2 2 Z" fill="currentColor" stroke="none" /></svg>;
    case "algebra": return <svg viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="11" height="11" rx="1.5" /><rect x="15" y="15" width="6" height="6" rx="1.5" /></svg>;
    case "fraction": return <svg viewBox="0 0 24 24" {...p}><rect x="3" y="8" width="18" height="8" rx="1.5" /><line x1="9" y1="8" x2="9" y2="16" /><line x1="15" y1="8" x2="15" y2="16" /><rect x="3" y="8" width="6" height="8" fill="currentColor" stroke="none" opacity="0.9" /></svg>;
    case "numberline": return <svg viewBox="0 0 24 24" {...p}><line x1="3" y1="14" x2="21" y2="14" /><line x1="6" y1="11" x2="6" y2="17" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="18" y1="11" x2="18" y2="17" /><circle cx="12" cy="14" r="2.6" fill="currentColor" stroke="none" /></svg>;
    case "hops": return <svg viewBox="0 0 24 24" {...p}><line x1="3" y1="17" x2="21" y2="17" /><path d="M6 17 q4 -10 8 0" /><circle cx="6" cy="17" r="1.8" fill="currentColor" stroke="none" /><path d="M14 17 l-2 -2 m2 2 l-2 2" /></svg>;
    case "groupbars": return <svg viewBox="0 0 24 24" {...p}><line x1="3" y1="20" x2="21" y2="20" /><rect x="5" y="11" width="3.4" height="9" fill="currentColor" stroke="none" /><rect x="10.3" y="6" width="3.4" height="14" fill="currentColor" stroke="none" /><rect x="15.6" y="14" width="3.4" height="6" fill="currentColor" stroke="none" /></svg>;
    case "today": return <svg viewBox="0 0 24 24" {...p}><path d="M6 3 h9 l4 4 v14 H6 Z" /><path d="M15 3 v4 h4" /><line x1="9" y1="13" x2="16" y2="13" /><line x1="9" y1="17" x2="16" y2="17" /></svg>;
    case "lessons": return <svg viewBox="0 0 24 24" {...p}><rect x="6" y="6" width="14" height="14" rx="2" /><path d="M4 16 V5 a1 1 0 0 1 1 -1 h11" /></svg>;
    case "join": return <svg viewBox="0 0 24 24" {...p}><circle cx="11" cy="9" r="3.2" /><path d="M5 19 a6 6 0 0 1 12 0" /><line x1="19" y1="7" x2="19" y2="12" /><line x1="16.5" y1="9.5" x2="21.5" y2="9.5" /></svg>;
  }
}

export default function HomePage() {
  return (
    <main className="hp-page">
      <style>{`
        .hp-page { min-height:100vh; background:#17181c; padding:clamp(14px,3vw,40px); font-family:Inter,ui-sans-serif,system-ui,sans-serif; box-sizing:border-box; }
        .hp-panel { max-width:1080px; margin:0 auto; background:#fbf7ef; border-radius:30px; padding:clamp(24px,4vw,52px); box-shadow:0 30px 80px -30px rgba(0,0,0,0.6); }
        .hp-banner { display:flex; justify-content:center; margin-bottom:14px; }
        .hp-banner img { width:100%; max-width:680px; height:auto; border-radius:22px; display:block; box-shadow:0 14px 30px -16px rgba(255,107,61,0.6); }
        .hp-sub { text-align:center; margin:0 0 clamp(26px,5vw,44px); color:#7a7468; font-size:clamp(1rem,2.4vw,1.25rem); font-weight:600; }

        .hp-section { margin-bottom:clamp(22px,4vw,38px); }
        .hp-section-title { font-size:0.72rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:#a89f8c; margin:0 0 14px; }
        .hp-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:clamp(12px,2vw,18px); }

        .hp-tile { display:flex; flex-direction:column; align-items:center; gap:14px; text-decoration:none; padding:22px 10px; border-radius:22px; background:#fff; border:1px solid #efe7d6; transition:transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease; }
        .hp-tile:hover { transform:translateY(-4px); box-shadow:0 16px 30px -14px rgba(0,0,0,0.35); border-color:#e2d8c2; }
        .hp-icon { width:88px; height:88px; border-radius:24px; display:grid; place-items:center; color:#fff; box-shadow:0 8px 0 0 rgba(0,0,0,0.10); }
        .hp-icon svg { width:48px; height:48px; }
        .hp-label { font-size:0.92rem; font-weight:800; color:#2a2a2e; text-align:center; line-height:1.2; }

        .hp-foot { text-align:center; margin-top:8px; color:#b3aa97; font-size:0.8rem; font-weight:600; }
      `}</style>

      <div className="hp-panel">
        <div className="hp-banner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/big-dog-logo.png" alt="Big Dog Math — Abbie" />
        </div>
        <p className="hp-sub">Pick a tool to get started.</p>

        {SECTIONS.map((sec) => (
          <section className="hp-section" key={sec.title}>
            <p className="hp-section-title">{sec.title}</p>
            <div className="hp-grid">
              {sec.tools.map((t) => (
                <Link className="hp-tile" href={t.href} key={t.href}>
                  <span className="hp-icon" style={{ background: t.color }}><Icon name={t.icon} /></span>
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
