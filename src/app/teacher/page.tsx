"use client";

// Big Dog Math teacher command view: classroom controls, student preview, and tool launchers.
import Link from "next/link";
import { useState } from "react";

type IconKey =
  | "control" | "timer" | "spinner" | "question"
  | "equation" | "gems" | "combine" | "proportion" | "percent" | "area"
  | "whiteboard" | "algebra" | "fraction" | "numberline" | "hops" | "groupbars" | "ladder" | "multiply"
  | "today" | "lessons" | "join" | "analytics";

interface Tool {
  href: string;
  label: string;
  icon: IconKey;
  color: string;
  description?: string;
}

interface Section {
  title: string;
  tools: Tool[];
}

const PRIMARY_COMMANDS: Tool[] = [
  { href: "/control", label: "Control Center", icon: "control", color: "#22c55e", description: "Timers, lineup, screens" },
  { href: "/session", label: "Live Session", icon: "join", color: "#14b8a6", description: "Join code and class mode" },
  { href: "/teacher/analytics", label: "Analytics", icon: "analytics", color: "#6366f1", description: "Warm-up and form responses" },
  { href: "/roster", label: "Rosters", icon: "join", color: "#10b981", description: "Periods and students" },
];

const STUDENT_PREVIEWS = [
  { label: "Home", path: "/" },
  { label: "Lesson", path: "/lesson" },
  { label: "Today", path: "/today" },
  { label: "Join", path: "/join" },
];

const TOOL_GROUPS: Section[] = [
  {
    title: "Run the room",
    tools: [
      { href: "/timer", label: "Timer", icon: "timer", color: "#f5b915" },
      { href: "/spinner", label: "Student Spinner", icon: "spinner", color: "#ff6b3d" },
      { href: "/start-question", label: "Start a Question", icon: "question", color: "#4d8df6" },
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
      { href: "/ladder-method", label: "Ladder Method", icon: "ladder", color: "#14b8a6" },
      { href: "/multiplication-fluency", label: "Multiplication Fluency", icon: "multiply", color: "#2563eb" },
    ],
  },
  {
    title: "Manipulatives",
    tools: [
      { href: "/whiteboard", label: "Whiteboard", icon: "whiteboard", color: "#0ea5e9" },
      { href: "/algebra-tiles", label: "Algebra Tiles", icon: "algebra", color: "#3b82f6" },
      { href: "/fraction-bars", label: "Fraction Bars", icon: "fraction", color: "#14b8a6" },
      { href: "/number-line", label: "Number Line", icon: "numberline", color: "#f59e0b" },
      { href: "/number-line-plus", label: "Number Line Hops", icon: "hops", color: "#38bdf8" },
      { href: "/group-bars", label: "Group Bars", icon: "groupbars", color: "#10b981" },
    ],
  },
  {
    title: "Student routes",
    tools: [
      { href: "/", label: "Student Home", icon: "today", color: "#1f2937" },
      { href: "/lesson", label: "Student Lesson", icon: "today", color: "#4d8df6" },
      { href: "/today", label: "Today Board", icon: "lessons", color: "#8b5cf6" },
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
    case "ladder": return <svg viewBox="0 0 24 24" {...p}><line x1="7" y1="3" x2="7" y2="21" /><line x1="17" y1="3" x2="17" y2="21" /><line x1="7" y1="7" x2="17" y2="7" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="7" y1="17" x2="17" y2="17" /></svg>;
    case "multiply": return <svg viewBox="0 0 24 24" {...p}><line x1="7" y1="7" x2="17" y2="17" /><line x1="17" y1="7" x2="7" y2="17" /></svg>;
    case "today": return <svg viewBox="0 0 24 24" {...p}><path d="M6 3 h9 l4 4 v14 H6 Z" /><path d="M15 3 v4 h4" /><line x1="9" y1="13" x2="16" y2="13" /><line x1="9" y1="17" x2="16" y2="17" /></svg>;
    case "lessons": return <svg viewBox="0 0 24 24" {...p}><rect x="6" y="6" width="14" height="14" rx="2" /><path d="M4 16 V5 a1 1 0 0 1 1 -1 h11" /></svg>;
    case "join": return <svg viewBox="0 0 24 24" {...p}><circle cx="11" cy="9" r="3.2" /><path d="M5 19 a6 6 0 0 1 12 0" /><line x1="19" y1="7" x2="19" y2="12" /><line x1="16.5" y1="9.5" x2="21.5" y2="9.5" /></svg>;
  }
}

function previewSrc(path: string) {
  return `${path}${path.includes("?") ? "&" : "?"}teacherPreview=1`;
}

export default function TeacherCommandPage() {
  const [previewPath, setPreviewPath] = useState(STUDENT_PREVIEWS[1].path);
  const [previewVersion, setPreviewVersion] = useState(0);
  const selectedPreview = STUDENT_PREVIEWS.find((item) => item.path === previewPath) ?? STUDENT_PREVIEWS[1];
  const studentSrc = previewSrc(selectedPreview.path);

  return (
    <main className="tc-page">
      <style>{`
        .tc-page { min-height:100vh; background:#f3f0e8; color:#1f2328; font-family:Inter,ui-sans-serif,system-ui,sans-serif; box-sizing:border-box; }
        .tc-shell { max-width:1280px; margin:0 auto; padding:18px clamp(14px,2.4vw,28px) 40px; }
        .tc-top { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:14px; }
        .tc-brand { display:flex; align-items:center; gap:12px; min-width:0; }
        .tc-logo { width:38px; height:38px; border-radius:8px; background:#ff6b3d; color:#fff; display:grid; place-items:center; font-weight:900; box-shadow:0 3px 0 rgba(0,0,0,0.12); }
        .tc-title { margin:0; font-size:clamp(1.45rem,2.8vw,2.3rem); line-height:1.05; font-weight:900; letter-spacing:0; }
        .tc-sub { margin:4px 0 0; color:#6f6a60; font-size:0.9rem; font-weight:700; }
        .tc-top-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        .tc-action { min-height:38px; display:inline-flex; align-items:center; justify-content:center; gap:8px; border-radius:8px; border:1px solid #d8d0bf; background:#fff; color:#282a2e; padding:0 13px; font-size:0.86rem; font-weight:900; text-decoration:none; white-space:nowrap; }
        .tc-action.primary { background:#1f2328; border-color:#1f2328; color:#fff; }
        .tc-action:hover { border-color:#8c8374; }

        .tc-layout { display:grid; grid-template-columns:minmax(260px,330px) minmax(0,1fr); gap:14px; align-items:start; }
        .tc-panel { background:#fff; border:1px solid #ded6c7; border-radius:8px; box-shadow:0 10px 28px -24px rgba(31,35,40,0.5); }
        .tc-panel-pad { padding:14px; }
        .tc-panel-head { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:13px 14px; border-bottom:1px solid #eee7dc; }
        .tc-h2 { margin:0; font-size:0.78rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; color:#766f62; }
        .tc-command-list { display:grid; gap:8px; }
        .tc-command { display:grid; grid-template-columns:40px 1fr; gap:10px; align-items:center; padding:10px; border:1px solid #eee7dc; border-radius:8px; color:#1f2328; text-decoration:none; background:#fff; }
        .tc-command:hover { border-color:#bdb4a4; background:#fbf8f1; }
        .tc-command-icon { width:40px; height:40px; border-radius:8px; color:#fff; display:grid; place-items:center; }
        .tc-command-icon svg { width:23px; height:23px; }
        .tc-command-title { display:block; font-size:0.95rem; font-weight:900; line-height:1.1; }
        .tc-command-desc { display:block; margin-top:3px; color:#7a7468; font-size:0.78rem; font-weight:700; line-height:1.25; }

        .tc-status { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
        .tc-status-box { background:#f8f4ec; border:1px solid #eee7dc; border-radius:8px; padding:10px; min-height:58px; }
        .tc-status-label { color:#8f8676; font-size:0.72rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .tc-status-value { margin-top:5px; color:#24272c; font-size:0.95rem; font-weight:900; }

        .tc-preview-wrap { display:grid; grid-template-rows:auto minmax(520px,1fr); min-height:680px; }
        .tc-preview-tools { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .tc-seg { border:1px solid #d8d0bf; background:#fff; color:#5f574c; border-radius:8px; padding:8px 11px; font-size:0.82rem; font-weight:900; cursor:pointer; }
        .tc-seg.on { background:#1f2328; border-color:#1f2328; color:#fff; }
        .tc-mini { border:1px solid #d8d0bf; background:#fff; color:#282a2e; border-radius:8px; padding:8px 11px; font-size:0.82rem; font-weight:900; cursor:pointer; text-decoration:none; }
        .tc-preview-stage { padding:14px; background:#292f3a; border-radius:0 0 8px 8px; display:grid; place-items:center; min-height:0; }
        .tc-device { width:min(100%, 440px); height:620px; background:#111827; border:10px solid #111827; border-radius:24px; box-shadow:0 22px 54px -26px #000; overflow:hidden; }
        .tc-device iframe { width:100%; height:100%; border:0; background:#fff; display:block; }
        .tc-devicebar { height:18px; background:#111827; display:flex; align-items:center; justify-content:center; }
        .tc-devicebar span { width:54px; height:4px; border-radius:999px; background:#303947; }

        .tc-main-stack { display:grid; gap:14px; }
        .tc-tool-groups { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
        .tc-tool-panel { padding:13px; }
        .tc-tool-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; margin-top:10px; }
        .tc-tool { display:grid; grid-template-columns:34px 1fr; align-items:center; gap:9px; min-height:52px; padding:8px; border-radius:8px; border:1px solid #eee7dc; background:#fff; text-decoration:none; color:#1f2328; }
        .tc-tool:hover { border-color:#bdb4a4; background:#fbf8f1; }
        .tc-tool-icon { width:34px; height:34px; border-radius:8px; display:grid; place-items:center; color:#fff; }
        .tc-tool-icon svg { width:20px; height:20px; }
        .tc-tool-label { font-size:0.86rem; font-weight:900; line-height:1.16; }
        .tc-route-note { margin:10px 0 0; color:#7a7468; font-size:0.8rem; font-weight:700; line-height:1.45; }

        @media (max-width:980px) {
          .tc-layout { grid-template-columns:1fr; }
          .tc-preview-wrap { min-height:auto; }
          .tc-tool-groups { grid-template-columns:1fr; }
          .tc-device { height:560px; }
        }
        @media (max-width:620px) {
          .tc-top { align-items:flex-start; flex-direction:column; }
          .tc-top-actions { justify-content:flex-start; }
          .tc-status { grid-template-columns:1fr; }
          .tc-device { width:100%; height:520px; border-width:7px; border-radius:18px; }
          .tc-preview-tools { width:100%; }
          .tc-seg, .tc-mini { flex:1 1 auto; }
        }
      `}</style>

      <div className="tc-shell">
        <header className="tc-top">
          <div className="tc-brand">
            <span className="tc-logo">B</span>
            <div>
              <h1 className="tc-title">Teacher Command</h1>
              <p className="tc-sub">Your view, their view, and class controls in one place.</p>
            </div>
          </div>
          <div className="tc-top-actions">
            <Link className="tc-action primary" href="/control">Open Control Center</Link>
            <Link className="tc-action" href="/" target="_blank">Open Student View</Link>
            <Link className="tc-action" href="/lesson" target="_blank">Open Lesson View</Link>
          </div>
        </header>

        <div className="tc-layout">
          <aside className="tc-panel tc-panel-pad">
            <h2 className="tc-h2">Command shortcuts</h2>
            <div className="tc-command-list" style={{ marginTop: 10 }}>
              {PRIMARY_COMMANDS.map((command) => (
                <Link className="tc-command" href={command.href} key={command.href}>
                  <span className="tc-command-icon" style={{ background: command.color }}><Icon name={command.icon} /></span>
                  <span>
                    <span className="tc-command-title">{command.label}</span>
                    {command.description && <span className="tc-command-desc">{command.description}</span>}
                  </span>
                </Link>
              ))}
            </div>

            <div className="tc-status">
              <div className="tc-status-box">
                <div className="tc-status-label">Teacher URL</div>
                <div className="tc-status-value">/teacher</div>
              </div>
              <div className="tc-status-box">
                <div className="tc-status-label">Student URL</div>
                <div className="tc-status-value">/</div>
              </div>
              <div className="tc-status-box">
                <div className="tc-status-label">Daily Lesson</div>
                <div className="tc-status-value">/lesson</div>
              </div>
              <div className="tc-status-box">
                <div className="tc-status-label">Board View</div>
                <div className="tc-status-value">/today</div>
              </div>
            </div>
          </aside>

          <section className="tc-main-stack">
            <div className="tc-panel tc-preview-wrap">
              <div className="tc-panel-head">
                <h2 className="tc-h2">Student preview</h2>
                <div className="tc-preview-tools">
                  {STUDENT_PREVIEWS.map((item) => (
                    <button
                      className={`tc-seg${previewPath === item.path ? " on" : ""}`}
                      key={item.path}
                      onClick={() => setPreviewPath(item.path)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                  <button className="tc-mini" onClick={() => setPreviewVersion((value) => value + 1)} type="button">Refresh</button>
                  <Link className="tc-mini" href={selectedPreview.path} target="_blank">Open</Link>
                </div>
              </div>
              <div className="tc-preview-stage">
                <div className="tc-device">
                  <div className="tc-devicebar"><span /></div>
                  <iframe
                    key={`${studentSrc}-${previewVersion}`}
                    src={studentSrc}
                    title={`${selectedPreview.label} student preview`}
                  />
                </div>
              </div>
            </div>

            <div className="tc-tool-groups">
              {TOOL_GROUPS.map((section) => (
                <section className="tc-panel tc-tool-panel" key={section.title}>
                  <h2 className="tc-h2">{section.title}</h2>
                  <div className="tc-tool-grid">
                    {section.tools.map((tool) => (
                      <Link className="tc-tool" href={tool.href} key={tool.href}>
                        <span className="tc-tool-icon" style={{ background: tool.color }}><Icon name={tool.icon} /></span>
                        <span className="tc-tool-label">{tool.label}</span>
                      </Link>
                    ))}
                  </div>
                  {section.title === "Student routes" && (
                    <p className="tc-route-note">Student preview disables class-mode redirects, so you can inspect pages without being pulled to the broadcast screen.</p>
                  )}
                </section>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
