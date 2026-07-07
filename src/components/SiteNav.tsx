"use client";

// Shared top navigation — consistent links so it's easy to move between pages.
// Teacher variant for teacher/admin pages; student variant for student pages.

import { usePathname } from "next/navigation";

const TEACHER = [
  { href: "/teacher",   label: "🏠 Home" },
  { href: "/builder",   label: "🧱 Builder" },
  { href: "/control",   label: "🎛 Control" },
  { href: "/session",   label: "📡 Session" },
  { href: "/teacher/challenges", label: "🎮 Games" },
  { href: "/teacher/assignments", label: "📝 Practice" },
  { href: "/teacher/exit-tickets", label: "🎟 Exit" },
  { href: "/teacher/checkpoints", label: "✅ Checks" },
  { href: "/teacher/rightnow", label: "Growth" },
  { href: "/roster",    label: "👥 Rosters" },
  { href: "/",          label: "Student view" },
];

const STUDENT = [
  { href: "/", label: "🏠 Home" },
  { href: "/lesson", label: "📚 Lesson" },
];

export default function SiteNav({ variant = "teacher" }: { variant?: "teacher" | "student" }) {
  const path = usePathname();
  const items = variant === "teacher" ? TEACHER : STUDENT;
  return (
    <nav className="nav-bar">
      <style>{`
        .nav-bar {
          display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
          max-width:1200px; margin:0 auto; padding:13px clamp(14px,3vw,28px);
          font-family:var(--bdb-font);
        }
        .nav-brand { display:inline-flex; align-items:center; gap:9px; text-decoration:none; }
        .nav-logo {
          width:32px; height:32px; display:block; object-fit:contain; flex:none;
        }
        .nav-name { font-weight:700; color:var(--bdb-ink); font-size:0.98rem; letter-spacing:-0.01em; }
        .nav-links { display:flex; gap:4px; flex-wrap:wrap; }
        .nav-link {
          text-decoration:none; color:var(--bdb-ink-soft); font-weight:600; font-size:0.84rem;
          padding:7px 13px; border-radius:999px; border:1px solid transparent;
          transition:background 120ms, color 120ms;
        }
        .nav-link:hover { background:color-mix(in srgb, var(--bdb-amber) 18%, transparent); color:var(--bdb-ink); }
        .nav-link.on { background:var(--bdb-ink); color:#fff; }
      `}</style>
      <a className="nav-brand" href={variant === "teacher" ? "/teacher" : "/"}>
        <img className="nav-logo" src="/big-dog-mark.png" alt="" />
        <span className="nav-name">bigdogmath</span>
      </a>
      <div className="nav-links">
        {items.map((i) => (
          <a key={i.href} href={i.href} className={`nav-link${path === i.href ? " on" : ""}`}>
            {i.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
