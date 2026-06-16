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
          max-width:1080px; margin:0 auto; padding:14px clamp(14px,3vw,28px); }
        .nav-brand { display:inline-flex; align-items:center; gap:9px; text-decoration:none; }
        .nav-logo { width:30px; height:30px; border-radius:8px; background:#ff6b3d; color:#fff; display:grid; place-items:center; font-weight:900; }
        .nav-name { font-weight:900; color:#1c1d22; font-size:0.95rem; letter-spacing:0.01em; }
        .nav-links { display:flex; gap:6px; flex-wrap:wrap; }
        .nav-link { text-decoration:none; color:#7a7468; font-weight:800; font-size:0.86rem; padding:8px 13px; border-radius:999px; border:1px solid transparent; }
        .nav-link:hover { background:#f1ead9; color:#2a2a2e; }
        .nav-link.on { background:#1c1d22; color:#fff; }
      `}</style>
      <a className="nav-brand" href={variant === "teacher" ? "/teacher" : "/"}>
        <span className="nav-logo">B</span>
        <span className="nav-name">Big Dog Math</span>
      </a>
      <div className="nav-links">
        {items.map((i) => <a key={i.href} href={i.href} className={`nav-link${path === i.href ? " on" : ""}`}>{i.label}</a>)}
      </div>
    </nav>
  );
}
