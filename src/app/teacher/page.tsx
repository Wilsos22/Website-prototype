"use client";

// Big Dog Math - teacher control center.
// Function-first launchpad: a real "right now" status band (today's lesson +
// live session state, pulled from /api/today and Supabase - never fake), then
// the teacher's actual workflow in labeled groups (Run class / See learning /
// Manage), with the manipulative tools kept as a secondary grid. No emojis.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { listLessonPresets, type LessonPreset } from "@/lib/lessonPresets";

interface LinkItem { href: string; label: string; letter: string; color: string; desc: string }

// Run the live class.
const RUN: LinkItem[] = [
  { href: "/control", label: "Control panel", letter: "C", color: "#f95335", desc: "Run the timed class sequence on the board" },
  { href: "/session", label: "Live session", letter: "S", color: "#50a3a4", desc: "Join code, live joins, push screens, polls" },
  { href: "/spinner", label: "Student spinner", letter: "R", color: "#7c5cd6", desc: "Random picker from the roster" },
  { href: "/timer", label: "Timer", letter: "T", color: "#674a40", desc: "Big classroom countdown" },
  { href: "/whiteboard", label: "Whiteboard", letter: "W", color: "#4d8df6", desc: "Full-screen board canvas" },
  { href: "/ipad", label: "iPad pen", letter: "i", color: "#50a3a4", desc: "Write from your iPad — shows on the Board" },
  { href: "/board", label: "Board display", letter: "B", color: "#f5b915", desc: "Open on the projector to show your iPad ink" },
];

// See the learning.
const LEARN: LinkItem[] = [
  { href: "/teacher/rightnow", label: "Growth", letter: "G", color: "#2f9e6f", desc: "Who to pull, grouped by misconception" },
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

// Teaching tools (secondary).
const TOOLS: LinkItem[] = [
  { href: "/algebra-tiles", label: "Algebra Tiles", letter: "A", color: "#2f9e6f", desc: "Expression builder" },
  { href: "/fraction-bars", label: "Fraction Bars", letter: "F", color: "#fcaf38", desc: "Fractions, decimals, percents" },
  { href: "/number-line-plus", label: "Number Line", letter: "N", color: "#674a40", desc: "Single or double number line" },
  { href: "/coordinate-grid", label: "Coordinate Grid", letter: "+", color: "#4d8df6", desc: "Plot points on the plane" },
  { href: "/equation-builder", label: "Equation Builder", letter: "E", color: "#2f9e6f", desc: "Guided step-by-step solve" },
  { href: "/order-of-operations", label: "GEMS Order of Ops", letter: "G", color: "#7c5cd6", desc: "Pick the step, build the line" },
  { href: "/combine-like-terms", label: "Combine Like Terms", letter: "C", color: "#f95335", desc: "Zero pairs and simplifying" },
  { href: "/proportions", label: "Proportion Builder", letter: "P", color: "#50a3a4", desc: "Scale factors, missing values" },
  { href: "/percent-bar", label: "Percent Bar", letter: "%", color: "#cf6f9b", desc: "Parts, wholes, benchmarks" },
  { href: "/area-model", label: "Area Model", letter: "A", color: "#fcaf38", desc: "Distributive property, visually" },
  { href: "/ladder-method", label: "Ladder Method", letter: "L", color: "#674a40", desc: "GCF, LCM, prime factors" },
  { href: "/multiplication-fluency", label: "Multiplication", letter: "x", color: "#3b7fc4", desc: "Fast-facts practice" },
  { href: "/group-bars", label: "Group Bars", letter: "G", color: "#2f9e6f", desc: "Equal groups and ratios" },
  { href: "/term-identifier", label: "Identify Terms", letter: "T", color: "#50a3a4", desc: "Sort the parts of an expression" },
];

const JUMP = [
  { label: "Right now", href: "#now" },
  { label: "Run class", href: "#run" },
  { label: "See learning", href: "#learn" },
  { label: "Manage", href: "#manage" },
  { label: "Teaching tools", href: "#tools" },
];

interface LiveSession { id: string; code: string; period: string; joined: number }

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function LinkCard({ item }: { item: LinkItem }) {
  return (
    <Link href={item.href} className="bd-card" style={{ ["--c" as string]: item.color }}>
      <span className="bd-tile">{item.letter}</span>
      <div className="bd-card-text">
        <h3>{item.label}</h3>
        <p>{item.desc}</p>
      </div>
    </Link>
  );
}

export default function TeacherHome() {
  const supabase = useMemo(() => getSupabase(), []);
  const [greeting, setGreeting] = useState("Welcome");
  const [query, setQuery] = useState("");
  const [presets, setPresets] = useState<LessonPreset[]>([]);

  const [today, setToday] = useState<{ loading: boolean; lesson: { title?: string; module?: string; topic?: string } | null; error?: string }>({ loading: true, lesson: null });
  const [live, setLive] = useState<{ loading: boolean; connected: boolean; sessions: LiveSession[] }>({ loading: true, connected: Boolean(supabase), sessions: [] });
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

  // Live sessions running right now (polls every 5s so the band stays current).
  const loadLive = useCallback(async () => {
    if (!supabase) { setLive({ loading: false, connected: false, sessions: [] }); return; }
    try {
      const { data: sess } = await supabase
        .from("sessions")
        .select("id,join_code,started_at,periods(name)")
        .eq("status", "open")
        .order("started_at", { ascending: false });
      const rows = (sess || []) as { id: string; join_code: string | null; periods: { name: string } | { name: string }[] | null }[];
      const counts: Record<string, number> = {};
      if (rows.length) {
        const ids = rows.map((r) => r.id);
        const { data: joins } = await supabase.from("session_joins").select("session_id").in("session_id", ids);
        for (const j of (joins || []) as { session_id: string }[]) counts[j.session_id] = (counts[j.session_id] || 0) + 1;
      }
      setLive({
        loading: false,
        connected: true,
        sessions: rows.map((r) => {
          const p = Array.isArray(r.periods) ? r.periods[0] : r.periods;
          return { id: r.id, code: r.join_code || "----", period: p?.name || "Class", joined: counts[r.id] || 0 };
        }),
      });
    } catch {
      setLive({ loading: false, connected: true, sessions: [] });
    }
  }, [supabase]);

  useEffect(() => {
    void loadLive();
    const t = setInterval(() => void loadLive(), 5000);
    return () => clearInterval(t);
  }, [loadLive]);

  // Roster totals.
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [{ count: pc }, { count: sc }] = await Promise.all([
        supabase.from("periods").select("id", { count: "exact", head: true }),
        supabase.from("students").select("id", { count: "exact", head: true }),
      ]);
      setRoster({ periods: pc || 0, students: sc || 0 });
    })().catch(() => { /* stat optional */ });
  }, [supabase]);

  const q = query.trim().toLowerCase();
  const tools = useMemo(() => TOOLS.filter((t) => !q || t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)), [q]);
  const lessons = useMemo(() => presets.filter((p) => !q || p.code.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)), [presets, q]);

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
                    <Link href="/session" className="bd-btn p">Manage session</Link>
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
                <p className="bd-stat-meta">{supabase ? "Loading roster totals." : "Connect Supabase to see roster totals."}</p>
              )}
              <div className="bd-stat-actions">
                <Link href="/roster" className="bd-btn">Edit rosters</Link>
              </div>
            </div>
          </div>

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
                {lessons.length === 0 ? (
                  <div className="bd-empty">No lessons match &ldquo;{query}&rdquo;.</div>
                ) : (
                  lessons.map((p) => (
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

          {/* TEACHING TOOLS (secondary) */}
          <h2 className="bd-sec-h" id="tools">Teaching tools</h2>
          <div className="bd-grid tools">
            {tools.length === 0 ? (
              <div className="bd-empty">No tools match &ldquo;{query}&rdquo;.</div>
            ) : (
              tools.map((i) => <LinkCard key={i.href} item={i} />)
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
