"use client";

// Shared top navigation — consistent links so it's easy to move between pages.
// Teacher variant for the teacher/admin pages; student variant for student pages.

import { usePathname } from "next/navigation";

const TEACHER = [
  { href: "/teacher", label: "Tools" },
  { href: "/control", label: "Control" },
  { href: "/session", label: "Session" },
  { href: "/roster", label: "Rosters" },
  { href: "/", label: "Student view" },
];
const STUDENT = [
  { href: "/", label: "Home" },
  { href: "/lesson", label: "Lesson" },
];

export default function SiteNav({ variant = "teacher" }: { variant?: "teacher" | "student" }) {
  const path = usePathname();
  const items = variant === "teacher" ? TEACHER : STUDENT;
  return (
    <nav className="nav-bar">
      <style>{`
        .nav-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
          max-width:1080px; margin:0 auto; padding:14px clamp(14px,3vw,28px); font-family:var(--bdb-font); }
        .nav-brand { display:inline-flex; align-items:center; gap:9px; text-decoration:none; }
        .nav-logo { width:30px; height:30px; border-radius:9px; background:var(--bdb-ink); color:var(--bdb-amber); display:grid; place-items:center; font-weight:800; font-size:0.95rem; }
        .nav-name { font-weight:700; color:var(--bdb-ink); font-size:0.98rem; letter-spacing:-0.01em; }
        .nav-links { display:flex; gap:6px; flex-wrap:wrap; }
        .nav-link { text-decoration:none; color:var(--bdb-ink-soft); font-weight:600; font-size:0.86rem; padding:8px 13px; border-radius:999px; border:1px solid transparent; transition:background 120ms, color 120ms; }
        .nav-link:hover { background:color-mix(in srgb, var(--bdb-amber) 16%, transparent); color:var(--bdb-ink); }
        .nav-link.on { background:var(--bdb-ink); color:#fff; }
      `}</style>
      <a className="nav-brand" href={variant === "teacher" ? "/teacher" : "/"}>
        <span className="nav-logo">b</span>
        <span className="nav-name">bigdogmath</span>
      </a>
      <div className="nav-links">
        {items.map((i) => <a key={i.href} href={i.href} className={`nav-link${path === i.href ? " on" : ""}`}>{i.label}</a>)}
      </div>
    </nav>
  );
}
