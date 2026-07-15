"use client";

// Big Dog Math - teacher control center.
// Function-first launchpad: a real "right now" status band (today's lesson +
// live session state, pulled from /api/today and Supabase - never fake), then
// the teacher's actual workflow in labeled groups (Run class / See learning /
// Manage), with the manipulative tools kept as a secondary grid. No emojis.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { teacherApiRequest } from "@/lib/teacherApi";
import { listLessonPresets, type LessonPreset } from "@/lib/lessonPresets";

interface LinkItem { href: string; label: string; letter: string; color: string; desc: string; newWindow?: boolean }

// Run the live class.
const RUN: LinkItem[] = [
  { href: "/control", label: "Control panel", letter: "C", color: "#f95335", desc: "Run the timed class sequence on the board" },
  { href: "/session", label: "Live session", letter: "S", color: "#50a3a4", desc: "Join code, live joins, push screens, polls" },
  { href: "/spinner", label: "Student spinner", letter: "R", color: "#7c5cd6", desc: "Random picker from the roster" },
  { href: "/timer", label: "Timer", letter: "T", color: "#674a40", desc: "Big classroom countdown" },
  { href: "/whiteboard", label: "Whiteboard", letter: "W", color: "#4d8df6", desc: "Full-screen board canvas" },
  { href: "/teacher/remote", label: "iPad remote", letter: "I", color: "#50a3a4", desc: "Private lesson controls, responses, audio, and writing" },
  { href: "/board", label: "Board display", letter: "B", color: "#f5b915", desc: "Open on the projector to show your iPad ink" },
  { href: "/weekly-display", label: "Weekly display", letter: "L", color: "#8b4fb3", desc: "Open today's Notion learning target on a separate screen", newWindow: true },
];

// See the learning.
const LEARN: LinkItem[] = [
  { href: "/teacher/rightnow", label: "Growth", letter: "G", color: "#2f9e6f", desc: "Who to pull, grouped by misconception" },
  { href: "/teacher/day-review", label: "Day review", letter: "D", color: "#f5b915", desc: "What each student did in the tools today" },
  { href: "/teacher/mastery", label: "Mastery", letter: "M", color: "#50a3a4", desc: "Per-domain bars and year growth" },
  { href: "/teacher/checkpoints", label: "Checkpoints", letter: "K", color: "#fcaf38", desc: "Tier-2 checkpoint results" },
  { href: "/teacher/exit-tickets", label: "Exit tickets", letter: "X", color: "#f95335", desc: "End-of-class checks" },
  { href: "/teacher/assignments", label: "Practice", letter: "P", color: "#674a40", desc: "Assignments and attempts" },
  { href: "/teacher/challenges", label: "Challenges", letter: "H", color: "#7c5cd6", desc: "Game-mode results" },
  { href: "/teacher/analytics", label: "Analytics", letter: "A", color: "#3b7fc4", desc: "Warm-up form insights" },
];

// Manage the class.
const MANAGE: LinkItem[] = [
  { href: "/roster", label: "Rosters", letter: "R", color: "#50a3a4", desc: "Periods and students" },
  { href: "/teacher/parent-outreach", label: "Parent outreach", letter: "@", color: "#f95335", desc: "Draft notes home — nudges and praise" },
  { href: "/teacher/checkpoint-upload", label: "Upload checkpoints", letter: "U", color: "#fcaf38", desc: "Import checkpoint CSVs" },
  { href: "/builder", label: "Sequence builder", letter: "B", color: "#674a40", desc: "Build a class flow" },
];

// Teaching tools, grouped by math strand. Move any tool between groups freely —
// this is a curated grouping, not derived from lesson data.
const TOOL_GROUPS: { label: string; tools: LinkItem[] }[] = [
  {
    label: "Number & Operations",
    tools: [
      { href: "/area-model", label: "Box Method", letter: "B", color: "#fcaf38", desc: "Fill-in-the-boxes multiplication" },
      { href: "/distributive-area", label: "Distributive Area Method", letter: "D", color: "#50a3a4", desc: "Split the rectangle to decompose" },
      { href: "/multiplication-fluency", label: "Multiplication", letter: "x", color: "#3b7fc4", desc: "Fast-facts practice" },
      { href: "/fraction-bars", label: "Fraction Bars", letter: "F", color: "#fcaf38", desc: "Fractions, decimals, percents" },
      { href: "/ladder-method", label: "Ladder Method", letter: "L", color: "#674a40", desc: "GCF, LCM, prime factors" },
    ],
  },
  {
    label: "Ratios & Proportions",
    tools: [
      { href: "/proportions", label: "Proportion Builder", letter: "P", color: "#50a3a4", desc: "Scale factors, missing values" },
      { href: "/percent-bar", label: "Percent Bar", letter: "%", color: "#cf6f9b", desc: "Parts, wholes, benchmarks" },
      { href: "/group-bars", label: "Group Bars", letter: "G", color: "#2f9e6f", desc: "Equal groups and ratios" },
      { href: "/number-line-plus", label: "Number Line", letter: "N", color: "#674a40", desc: "Single or double number line" },
    ],
  },
  {
    label: "Expressions & Equations",
    tools: [
      { href: "/order-of-operations", label: "GEMS Order of Ops", letter: "G", color: "#7c5cd6", desc: "Pick the step, build the line" },
      { href: "/equation-builder", label: "Equation Builder", letter: "E", color: "#2f9e6f", desc: "Guided step-by-step solve" },
      { href: "/balance-beam", label: "Balance Beam", letter: "B", color: "#50a3a4", desc: "Keep the scale even to solve" },
      { href: "/combine-like-terms", label: "Combine Like Terms", letter: "C", color: "#f95335", desc: "Zero pairs and simplifying" },
      { href: "/algebra-tiles", label: "Algebra Tiles", letter: "A", color: "#2f9e6f", desc: "Expression builder" },
      { href: "/term-identifier", label: "Identify Terms", letter: "T", color: "#50a3a4", desc: "Sort the parts of an expression" },
    ],
  },
  {
    label: "Geometry",
    tools: [
      { href: "/area-explorer", label: "Area Explorer", letter: "A", color: "#50a3a4", desc: "Area of 2D shapes: solve and derive" },
      { href: "/coordinate-grid", label: "Coordinate Grid", letter: "+", color: "#4d8df6", desc: "Plot points on the plane" },
    ],
  },
];

const JUMP = [
  { label: "Right now", href: "#now" },
  { label: "Find lesson", href: "#lesson-finder" },
  { label: "Run class", href: "#run" },
  { label: "See learning", href: "#learn" },
  { label: "Manage", href: "#manage" },
  { label: "Teaching tools", href: "#tools" },
];

interface LiveSession { id: string; code: string; period: string; joined: number }

interface PublishedLesson {
  id: string;
  lessonCode: string;
  title: string;
  subtitle?: string;
  date: string;
  module?: string;
  topic?: string;
}

const OMITTED_LESSON_MARKERS = /\b(skip|skipped|superseded|deprecated|archived|cancelled|canceled|replaced|do not use)\b/i;

function usablePublishedLessons(lessons: PublishedLesson[]): PublishedLesson[] {
  const seenIds = new Set<string>();
  return lessons.filter((lesson) => {
    const lessonCode = lesson.lessonCode.trim();
    if (!lessonCode) return false;
    if (OMITTED_LESSON_MARKERS.test([lessonCode, lesson.title, lesson.subtitle || ""].join(" "))) return false;
    const key = lesson.id.trim().replace(/-/g, "").toLowerCase();
    if (!key || seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });
}

function lessonDateValue(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return Number.POSITIVE_INFINITY;
  return new Date(year, month - 1, day).getTime();
}

function formatLessonDate(iso: string): string {
  const value = lessonDateValue(iso);
  if (!Number.isFinite(value)) return "Date not set";
  return new Date(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function LinkCard({ item }: { item: LinkItem }) {
  return (
    <Link
      href={item.href}
      className="bd-card"
      style={{ ["--c" as string]: item.color }}
      target={item.newWindow ? "_blank" : undefined}
      rel={item.newWindow ? "noreferrer" : undefined}
    >
      <span className="bd-tile">{item.letter}</span>
      <div className="bd-card-text">
        <h3>{item.label}</h3>
        <p>{item.desc}</p>
      </div>
    </Link>
  );
}

export default function TeacherHome() {
  const [greeting, setGreeting] = useState("Welcome");
  const [query, setQuery] = useState("");
  const [presets, setPresets] = useState<LessonPreset[]>([]);
  const [publishedLessons, setPublishedLessons] = useState<PublishedLesson[]>([]);
  const [publishedLessonsLoading, setPublishedLessonsLoading] = useState(true);
  const [publishedLessonsError, setPublishedLessonsError] = useState<string | null>(null);

  const [today, setToday] = useState<{ loading: boolean; lesson: { title?: string; module?: string; topic?: string } | null; error?: string }>({ loading: true, lesson: null });
  const [live, setLive] = useState<{ loading: boolean; connected: boolean; sessions: LiveSession[] }>({ loading: true, connected: true, sessions: [] });
  const [roster, setRoster] = useState<{ periods: number; students: number } | null>(null);

  useEffect(() => {
    setGreeting(greetingFor(new Date().getHours()));
    listLessonPresets().then(setPresets).catch(() => { /* presets optional */ });
  }, []);

  // Today's published lesson (public route, works regardless of Supabase).
  useEffect(() => {
    fetch("/api/today", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setToday({ loading: false, lesson: d.lesson || null, error: d.error }))
      .catch(() => setToday({ loading: false, lesson: null, error: "Couldn't reach the lesson feed." }));
  }, []);

  // Published Notion lessons for the teacher's lesson finder.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/lessons", { cache: "no-store" });
        const result = await response.json().catch(() => ({})) as { lessons?: PublishedLesson[]; error?: string };
        if (!response.ok || result.error) throw new Error(result.error || "Published lessons could not be loaded.");
        if (!cancelled) {
          setPublishedLessons(usablePublishedLessons(result.lessons ?? []));
          setPublishedLessonsError(null);
        }
      } catch (lessonError) {
        if (!cancelled) {
          setPublishedLessonsError(lessonError instanceof Error ? lessonError.message : "Published lessons could not be loaded.");
        }
      } finally {
        if (!cancelled) setPublishedLessonsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Live sessions running right now (polls every 5s so the band stays current).
  const loadLive = useCallback(async () => {
    try {
      const [sessionResult, rosterResult] = await Promise.all([
        teacherApiRequest<{ sessions: Array<{ id: string; join_code: string | null; status: string; period_id: string }> }>("/api/teacher/session"),
        teacherApiRequest<{ periods: Array<{ id: string; name: string }> }>("/api/teacher/roster"),
      ]);
      const rows = sessionResult.sessions.filter((session) => session.status === "open");
      const periodNames = new Map(rosterResult.periods.map((period) => [period.id, period.name]));
      const details = await Promise.all(rows.map((session) => teacherApiRequest<{ joins: unknown[] }>(
        `/api/teacher/session?sessionId=${encodeURIComponent(session.id)}`,
      )));
      setLive({
        loading: false,
        connected: true,
        sessions: rows.map((r, index) => {
          return { id: r.id, code: r.join_code || "----", period: periodNames.get(r.period_id) || "Class", joined: details[index]?.joins.length || 0 };
        }),
      });
    } catch {
      setLive({ loading: false, connected: true, sessions: [] });
    }
  }, []);

  useEffect(() => {
    void loadLive();
    const t = setInterval(() => void loadLive(), 5000);
    return () => clearInterval(t);
  }, [loadLive]);

  // Roster totals.
  useEffect(() => {
    (async () => {
      const result = await teacherApiRequest<{ periods: unknown[]; students: unknown[] }>("/api/teacher/roster");
      setRoster({ periods: result.periods.length, students: result.students.length });
    })().catch(() => { /* stat optional */ });
  }, []);

  const q = query.trim().toLowerCase();
  const toolGroups = useMemo(
    () => TOOL_GROUPS
      .map((g) => ({ label: g.label, tools: g.tools.filter((t) => !q || t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)) }))
      .filter((g) => g.tools.length > 0),
    [q],
  );
  const presetMatches = useMemo(() => presets.filter((p) => !q || p.code.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)), [presets, q]);
  const notionLessonMatches = useMemo(() => {
    const todayValue = new Date().setHours(0, 0, 0, 0);
    return publishedLessons
      .filter((lesson) => {
        if (!q) return true;
        return [lesson.lessonCode, lesson.title, lesson.subtitle, lesson.date, lesson.module, lesson.topic]
          .some((value) => value?.toLowerCase().includes(q));
      })
      .sort((left, right) => {
        const leftDate = lessonDateValue(left.date);
        const rightDate = lessonDateValue(right.date);
        if (!Number.isFinite(leftDate)) return Number.isFinite(rightDate) ? 1 : 0;
        if (!Number.isFinite(rightDate)) return -1;
        const leftFuture = leftDate >= todayValue;
        const rightFuture = rightDate >= todayValue;
        if (leftFuture !== rightFuture) return leftFuture ? -1 : 1;
        return leftFuture ? leftDate - rightDate : rightDate - leftDate;
      });
  }, [publishedLessons, q]);
  const visibleNotionLessons = notionLessonMatches.slice(0, 6);

  return (
    <div className="bd-home">
      <style>{`
        .bd-home { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); }
        .bd-home a { color:inherit; text-decoration:none; }

        .bd-top { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:16px;
          padding:12px clamp(16px,3vw,32px); background:color-mix(in srgb, var(--bdb-ground) 90%, transparent);
          backdrop-filter:saturate(1.1) blur(8px); border-bottom:1px solid var(--bdb-line); }
        .bd-brand { display:flex; align-items:center; gap:10px; font-weight:700; font-size:1.04rem; letter-spacing:-0.01em; flex:none; }
        .bd-mark { width:30px; height:30px; display:block; object-fit:contain; flex:none; }
        .bd-search { flex:1; max-width:520px; display:flex; align-items:center; gap:9px; background:var(--bdb-card);
          border:1px solid var(--bdb-line); border-radius:var(--bdb-r-pill); padding:8px 15px; box-shadow:var(--bdb-shadow-sm); }
        .bd-search input { border:none; outline:none; background:transparent; flex:1; font:inherit; color:var(--bdb-ink); }
        .bd-search input::placeholder { color:var(--bdb-ink-faint); }
        .bd-search svg { width:16px; height:16px; color:var(--bdb-ink-faint); flex:none; }
        .bd-top-spacer { flex:1; }
        .bd-present { flex:none; border:none; background:var(--bdb-coral); color:#fff; border-radius:var(--bdb-r-pill);
          padding:9px 18px; font-weight:700; font-size:0.9rem; box-shadow:var(--bdb-shadow-sm); }

        .bd-body { display:grid; grid-template-columns:184px minmax(0,1fr); gap:clamp(16px,2.4vw,32px);
          max-width:1280px; margin:0 auto; padding:clamp(16px,2.6vw,28px) clamp(16px,3vw,32px) 56px; }
        .bd-rail { position:sticky; top:74px; align-self:start; display:flex; flex-direction:column; gap:2px; }
        .bd-rail-label { font-size:0.68rem; font-weight:800; letter-spacing:0.13em; text-transform:uppercase; color:var(--bdb-ink-faint); padding:4px 12px 8px; }
        .bd-rail a { display:flex; align-items:center; gap:9px; padding:8px 12px; border-radius:var(--bdb-r-sm); font-weight:600; font-size:0.9rem; color:var(--bdb-ink-soft); }
        .bd-rail a:hover { background:color-mix(in srgb, var(--bdb-amber) 16%, transparent); color:var(--bdb-ink); }
        .bd-rail .dot { width:7px; height:7px; border-radius:50%; background:currentColor; opacity:0.35; flex:none; }

        .bd-main { min-width:0; }
        .bd-greet { font-size:clamp(1.4rem,3vw,1.9rem); font-weight:700; letter-spacing:-0.02em; margin:2px 0 16px; }

        .bd-sec-h { font-size:0.72rem; font-weight:800; letter-spacing:0.13em; text-transform:uppercase; color:var(--bdb-ink-faint); margin:30px 2px 12px; scroll-margin-top:80px; }
        .bd-sec-h:first-of-type { margin-top:6px; }
        .bd-strand { margin-top:2px; }
        .bd-strand-h { display:flex; align-items:center; gap:8px; font-size:0.84rem; font-weight:800; color:var(--bdb-ink-soft); margin:16px 2px 10px; }
        .bd-strand-h::before { content:""; width:8px; height:8px; border-radius:2px; background:var(--bdb-teal); flex:none; }

        /* Right-now status band */
        .bd-status { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px,1fr)); gap:14px; scroll-margin-top:80px; }
        .bd-stat { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg); padding:16px 18px; box-shadow:var(--bdb-shadow-sm); border-left:5px solid var(--sc,var(--bdb-amber)); display:flex; flex-direction:column; }
        .bd-stat-k { font-size:0.68rem; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:var(--bdb-ink-faint); margin-bottom:8px; display:flex; align-items:center; gap:7px; }
        .bd-stat-k .live { width:8px; height:8px; border-radius:50%; background:var(--bdb-green); box-shadow:0 0 0 0 color-mix(in srgb,var(--bdb-green) 60%,transparent); animation:bdpulse 2s infinite; }
        @keyframes bdpulse { 0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--bdb-green) 55%,transparent);} 70%{box-shadow:0 0 0 7px transparent;} 100%{box-shadow:0 0 0 0 transparent;} }
        .bd-stat-title { font-size:1.12rem; font-weight:700; letter-spacing:-0.01em; margin:0 0 3px; }
        .bd-stat-meta { color:var(--bdb-ink-soft); font-size:0.86rem; margin:0 0 12px; }
        .bd-stat-actions { margin-top:auto; display:flex; flex-wrap:wrap; gap:8px; }
        .bd-btn { font:inherit; font-weight:700; font-size:0.83rem; padding:7px 13px; border-radius:var(--bdb-r-pill); border:1px solid var(--bdb-line); background:var(--bdb-ground-2); color:var(--bdb-ink); }
        .bd-btn.p { background:var(--bdb-ink); color:#fff; border-color:var(--bdb-ink); }
        .bd-code { font-size:1.7rem; font-weight:900; letter-spacing:0.14em; color:var(--bdb-teal); line-height:1.05; }
        .bd-warn { font-size:0.86rem; color:var(--bdb-ink-soft); margin:0 0 12px; }
        .bd-mods { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 8px; }
        .bd-mod { font-size:0.72rem; font-weight:700; padding:3px 9px; border-radius:var(--bdb-r-pill); background:var(--bdb-ground-2); color:var(--bdb-ink-soft); }

        /* Compact published-lesson finder */
        .bd-lesson-finder { margin-top:14px; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg); box-shadow:var(--bdb-shadow-sm); overflow:hidden; scroll-margin-top:80px; }
        .bd-lesson-find-head { display:flex; align-items:end; justify-content:space-between; gap:16px; padding:14px 16px; border-bottom:1px solid var(--bdb-line); }
        .bd-lesson-find-copy h2 { margin:0; font-size:1rem; font-weight:800; letter-spacing:-0.01em; }
        .bd-lesson-find-copy p { margin:3px 0 0; color:var(--bdb-ink-soft); font-size:0.8rem; }
        .bd-lesson-search { display:grid; gap:5px; width:min(100%,330px); color:var(--bdb-ink-soft); font-size:0.7rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; }
        .bd-lesson-search input { width:100%; box-sizing:border-box; border:1px solid var(--bdb-line); border-radius:var(--bdb-r-sm); background:var(--bdb-ground); color:var(--bdb-ink); padding:9px 11px; font:inherit; font-size:0.88rem; font-weight:600; letter-spacing:0; text-transform:none; }
        .bd-lesson-search input:focus { outline:2px solid color-mix(in srgb,var(--bdb-teal) 48%,transparent); outline-offset:1px; border-color:var(--bdb-teal); }
        .bd-lesson-list { display:grid; }
        .bd-lesson-row { display:grid; grid-template-columns:145px minmax(115px,155px) minmax(180px,1fr) auto; align-items:center; gap:12px; padding:11px 16px; border-bottom:1px solid var(--bdb-line); }
        .bd-lesson-row:last-child { border-bottom:0; }
        .bd-lesson-date { color:var(--bdb-ink-soft); font-size:0.78rem; font-weight:600; }
        .bd-lesson-code { color:var(--bdb-teal); font-size:0.82rem; font-weight:800; letter-spacing:0.03em; }
        .bd-lesson-title { margin:0; min-width:0; color:var(--bdb-ink); font-size:0.9rem; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .bd-lesson-actions { display:flex; justify-content:flex-end; gap:7px; }
        .bd-lesson-actions .bd-btn { display:inline-flex; align-items:center; justify-content:center; white-space:nowrap; }
        .bd-lesson-state { margin:0; padding:18px 16px; color:var(--bdb-ink-soft); font-size:0.86rem; font-weight:600; }
        .bd-lesson-state.error { color:var(--bdb-coral); }
        .bd-lesson-more { margin:0; padding:9px 16px; border-top:1px solid var(--bdb-line); background:var(--bdb-ground-2); color:var(--bdb-ink-soft); font-size:0.76rem; font-weight:600; }

        /* Card grids for link groups + tools */
        .bd-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(232px,1fr)); gap:12px; }
        .bd-grid.tools { grid-template-columns:repeat(auto-fill, minmax(198px,1fr)); }
        .bd-card { display:flex; align-items:center; gap:12px; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:13px 15px; box-shadow:var(--bdb-shadow-sm); transition:transform 120ms ease, box-shadow 120ms ease, border-color 120ms; }
        .bd-card:hover { transform:translateY(-1px); box-shadow:var(--bdb-shadow); border-color:color-mix(in srgb, var(--c,#674a40) 45%, var(--bdb-line)); }
        .bd-tile { width:38px; height:38px; border-radius:10px; display:grid; place-items:center; font-weight:800; font-size:1rem; flex:none;
          background:color-mix(in srgb, var(--c) 16%, white); color:color-mix(in srgb, var(--c) 80%, black); }
        .bd-card-text { min-width:0; }
        .bd-card h3 { margin:0; font-size:0.98rem; font-weight:700; letter-spacing:-0.01em; }
        .bd-card p { margin:2px 0 0; font-size:0.8rem; color:var(--bdb-ink-soft); line-height:1.3; }
        .bd-grid.tools .bd-card p { display:none; }

        .bd-empty { color:var(--bdb-ink-faint); font-size:0.9rem; padding:8px 2px; }

        @media (max-width:760px) {
          .bd-body { grid-template-columns:1fr; }
          .bd-rail { position:static; flex-direction:row; flex-wrap:wrap; gap:6px; }
          .bd-rail-label { display:none; }
          .bd-lesson-find-head { align-items:stretch; flex-direction:column; }
          .bd-lesson-search { width:100%; }
          .bd-lesson-row { grid-template-columns:1fr 1fr; gap:7px 10px; }
          .bd-lesson-title { grid-column:1 / -1; white-space:normal; }
          .bd-lesson-actions { grid-column:1 / -1; justify-content:stretch; }
          .bd-lesson-actions .bd-btn { flex:1; }
        }
      `}</style>

      <header className="bd-top">
        <div className="bd-brand">
          <img className="bd-mark" src="/big-dog-mark.png" alt="" />
          <span>bigdogmath</span>
        </div>
        <div className="bd-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tools and lessons" aria-label="Search tools and lessons" />
        </div>
        <div className="bd-top-spacer" />
        <Link href="/control" className="bd-present">Open control panel</Link>
      </header>

      <div className="bd-body">
        <nav className="bd-rail" aria-label="Jump to">
          <div className="bd-rail-label">Jump to</div>
          {JUMP.map((j) => (
            <a key={j.href} href={j.href}><span className="dot" />{j.label}</a>
          ))}
        </nav>

        <main className="bd-main">
          <h1 className="bd-greet">{greeting}, Mr. Wilson</h1>

          {/* RIGHT NOW - real status */}
          <div className="bd-status" id="now">
            {/* Today's lesson */}
            <div className="bd-stat" style={{ ["--sc" as string]: "var(--bdb-amber)" }}>
              <div className="bd-stat-k">Today&apos;s lesson</div>
              {today.loading ? (
                <p className="bd-stat-meta">Checking today&apos;s schedule.</p>
              ) : today.lesson ? (
                <>
                  {(today.lesson.module || today.lesson.topic) && (
                    <div className="bd-mods">
                      {today.lesson.module && <span className="bd-mod">{today.lesson.module}</span>}
                      {today.lesson.topic && <span className="bd-mod">{today.lesson.topic}</span>}
                    </div>
                  )}
                  <p className="bd-stat-title">{today.lesson.title || "Published lesson"}</p>
                  <div className="bd-stat-actions">
                    <Link href="/control" className="bd-btn p">Open in control</Link>
                    <Link href="/lesson" className="bd-btn">Student view</Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="bd-stat-title">No lesson published for today</p>
                  <p className="bd-stat-meta">Publish one in the Notion lessons database.</p>
                  <div className="bd-stat-actions">
                    <Link href="/lessons" className="bd-btn">Lesson archive</Link>
                    <Link href="/builder" className="bd-btn">Sequence builder</Link>
                  </div>
                </>
              )}
            </div>

            {/* Live session */}
            <div className="bd-stat" style={{ ["--sc" as string]: live.sessions.length ? "var(--bdb-green)" : "var(--bdb-teal)" }}>
              <div className="bd-stat-k">{live.sessions.length > 0 && <span className="live" />}Live session</div>
              {live.loading ? (
                <p className="bd-stat-meta">Checking for a running session.</p>
              ) : !live.connected ? (
                <>
                  <p className="bd-stat-title">Supabase not connected</p>
                  <p className="bd-warn">Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel, then redeploy.</p>
                </>
              ) : live.sessions.length > 0 ? (
                <>
                  <p className="bd-stat-title">{live.sessions[0].period}</p>
                  <div className="bd-code">{live.sessions[0].code}</div>
                  <p className="bd-stat-meta">{live.sessions[0].joined} joined{live.sessions.length > 1 ? ` - +${live.sessions.length - 1} more open` : ""}</p>
                  <div className="bd-stat-actions">
                    <Link href={`/session?sessionId=${encodeURIComponent(live.sessions[0].id)}`} className="bd-btn p">Manage session</Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="bd-stat-title">No session running</p>
                  <p className="bd-stat-meta">Start a join code so students can connect.</p>
                  <div className="bd-stat-actions">
                    <Link href="/session" className="bd-btn p">Start a session</Link>
                  </div>
                </>
              )}
            </div>

            {/* Roster */}
            <div className="bd-stat" style={{ ["--sc" as string]: "var(--bdb-brown)" }}>
              <div className="bd-stat-k">Roster</div>
              {roster ? (
                <>
                  <p className="bd-stat-title">{roster.students} students</p>
                  <p className="bd-stat-meta">{roster.periods} class {roster.periods === 1 ? "period" : "periods"}</p>
                </>
              ) : (
                <p className="bd-stat-meta">Loading roster totals.</p>
              )}
              <div className="bd-stat-actions">
                <Link href="/roster" className="bd-btn">Edit rosters</Link>
              </div>
            </div>
          </div>

          <section className="bd-lesson-finder" id="lesson-finder" aria-labelledby="bd-lesson-finder-title">
            <div className="bd-lesson-find-head">
              <div className="bd-lesson-find-copy">
                <h2 id="bd-lesson-finder-title">Find a published lesson</h2>
                <p>Linked Notion Lesson Steps fill each screen. Review the formatted sequence or begin it.</p>
              </div>
              <label className="bd-lesson-search">
                Find by date, code, or title
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="M1.T1.L1 or lesson title"
                  aria-label="Find a published lesson by date, code, or title"
                />
              </label>
            </div>

            {publishedLessonsLoading ? (
              <p className="bd-lesson-state" role="status">Loading published lessons.</p>
            ) : publishedLessonsError ? (
              <p className="bd-lesson-state error" role="alert">{publishedLessonsError}</p>
            ) : visibleNotionLessons.length === 0 ? (
              <p className="bd-lesson-state">
                {q ? `No published lessons match "${query.trim()}".` : "No published lessons with usable lesson codes were found."}
              </p>
            ) : (
              <>
                <div className="bd-lesson-list">
                  {visibleNotionLessons.map((lesson) => {
                    const encodedId = encodeURIComponent(lesson.id);
                    return (
                      <div className="bd-lesson-row" key={lesson.id}>
                        <time className="bd-lesson-date" dateTime={lesson.date || undefined}>{formatLessonDate(lesson.date)}</time>
                        <span className="bd-lesson-code">{lesson.lessonCode}</span>
                        <p className="bd-lesson-title" title={lesson.title}>{lesson.title || "Untitled lesson"}</p>
                        <div className="bd-lesson-actions">
                          <Link className="bd-btn" href={`/control?notionLessonId=${encodedId}`}>Review</Link>
                          <Link className="bd-btn p" href={`/control?notionLessonId=${encodedId}&run=1`}>Begin lesson</Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {notionLessonMatches.length > visibleNotionLessons.length && (
                  <p className="bd-lesson-more">Showing {visibleNotionLessons.length} of {notionLessonMatches.length}. Refine the search to find another lesson.</p>
                )}
              </>
            )}
          </section>

          {/* RUN CLASS */}
          <h2 className="bd-sec-h" id="run">Run class</h2>
          <div className="bd-grid">{RUN.map((i) => <LinkCard key={i.href} item={i} />)}</div>

          {/* SEE LEARNING */}
          <h2 className="bd-sec-h" id="learn">See the learning</h2>
          <div className="bd-grid">{LEARN.map((i) => <LinkCard key={i.href} item={i} />)}</div>

          {/* MANAGE */}
          <h2 className="bd-sec-h" id="manage">Manage</h2>
          <div className="bd-grid">{MANAGE.map((i) => <LinkCard key={i.href} item={i} />)}</div>

          {/* LESSON LIBRARY (only when presets exist) */}
          {presets.length > 0 && (
            <>
              <h2 className="bd-sec-h">Lesson library - load and start</h2>
              <div className="bd-grid">
                {presetMatches.length === 0 ? (
                  <div className="bd-empty">No lessons match &ldquo;{query}&rdquo;.</div>
                ) : (
                  presetMatches.map((p) => (
                    <Link key={p.id} href={`/control?lesson=${p.id}`} className="bd-card" style={{ ["--c" as string]: "#fcaf38" }}>
                      <span className="bd-tile">L</span>
                      <div className="bd-card-text">
                        <h3>{p.code || "Lesson"}</h3>
                        {p.title && <p>{p.title}</p>}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </>
          )}

          {/* TEACHING TOOLS — grouped by math strand */}
          <h2 className="bd-sec-h" id="tools">Teaching tools</h2>
          {toolGroups.length === 0 ? (
            <div className="bd-empty">No tools match &ldquo;{query}&rdquo;.</div>
          ) : (
            toolGroups.map((g) => (
              <div key={g.label} className="bd-strand">
                <h3 className="bd-strand-h">{g.label}</h3>
                <div className="bd-grid tools">
                  {g.tools.map((i) => <LinkCard key={i.href} item={i} />)}
                </div>
              </div>
            ))
          )}
        </main>
      </div>
    </div>
  );
}
