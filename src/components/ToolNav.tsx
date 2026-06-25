"use client";

// ToolNav — minimal cream top bar for individual math tool pages.
// Shown at the top of every manipulative / guided practice page so teachers
// and students can always get back to the right place.

import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/teacher", label: "← Tools" },
  { href: "/control", label: "Control" },
  { href: "/lesson", label: "Lesson" },
];

export default function ToolNav({ title }: { title?: string }) {
  const path = usePathname();
  return (
    <nav className="tn-bar">
      <style>{`
        .tn-bar {
          display:flex; align-items:center; gap:10px; flex-wrap:wrap;
          padding:10px clamp(12px,3vw,24px);
          background:var(--bdb-ground);
          border-bottom:1px solid var(--bdb-line);
          font-family:var(--bdb-font);
        }
        .tn-brand { display:inline-flex; align-items:center; gap:8px; text-decoration:none; flex:none; }
        .tn-logo { width:28px; height:28px; display:block; object-fit:contain; flex:none; }
        .tn-title { font-weight:700; font-size:0.92rem; color:var(--bdb-ink); letter-spacing:-0.01em; }
        .tn-sep { width:1px; height:18px; background:var(--bdb-line); flex:none; }
        .tn-links { display:flex; gap:4px; flex-wrap:wrap; }
        .tn-link {
          text-decoration:none; color:var(--bdb-ink-soft); font-weight:600; font-size:0.82rem;
          padding:6px 12px; border-radius:999px; border:1px solid transparent;
          transition:background 120ms, color 120ms;
        }
        .tn-link:hover { background:color-mix(in srgb, var(--bdb-amber) 16%, transparent); color:var(--bdb-ink); }
        .tn-link.on { background:var(--bdb-ink); color:#fff; }
      `}</style>
      <a className="tn-brand" href="/teacher">
        <img className="tn-logo" src="/big-dog-mark.png" alt="" />
        {title && <span className="tn-title">{title}</span>}
      </a>
      <div className="tn-sep" />
      <div className="tn-links">
        {NAV_LINKS.map((l) => (
          <a key={l.href} href={l.href} className={`tn-link${path === l.href ? " on" : ""}`}>{l.label}</a>
        ))}
      </div>
    </nav>
  );
}
