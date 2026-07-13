"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import RatioBuilder from "@/components/RatioBuilder";

interface LessonData {
  id: string;
  lessonCode: string;
  title: string;
  subtitle: string;
  essentialIdeas: string;
  assignmentLink: string;
  date: string;
  dueDate: string;
  topic: string;
  module: string;
  moduleTopic: string;
  standard: string;
  warmUpLink: string;
  exitTicketLink: string;
  explainerVideo: string;
  learningIntention: string;
  successCriteria: string;
}

const RATIO_PREVIEW: LessonData = {
  id: "ratio-preview",
  lessonCode: "M2.T1.L1-D1",
  title: "Building the Meaning of a Ratio",
  subtitle: "It is all relative",
  essentialIdeas: "A ratio compares two quantities using division. Ratios may compare part-to-part or part-to-whole. The order of the quantities matters.",
  assignmentLink: "#assignment",
  date: "2026-07-13",
  dueDate: "2026-07-13",
  topic: "M2.T1",
  module: "Module 2",
  moduleTopic: "Ratio Reasoning",
  standard: "6.RP.1",
  warmUpLink: "#warmup",
  exitTicketLink: "#exit-ticket",
  explainerVideo: "",
  learningIntention: "We are learning to compare two quantities and build the meaning of a ratio.",
  successCriteria: "I can distinguish additive and multiplicative comparisons.\nI can build and draw a ratio relationship.\nI can write a ratio in words, with a colon, and in fractional form with labels.\nI can classify a ratio as part-to-part or part-to-whole.",
};

const RATIO_VOCABULARY = [
  "ratio",
  "part-to-part",
  "part-to-whole",
  "additive",
  "multiplicative",
];

function formatDate(iso: string): string {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function splitIdeas(value: string): string[] {
  return value
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitCriteria(value: string): string[] {
  const lines = value
    .split(/\r?\n|(?=I can\s)/)
    .map((item) => item.trim())
    .filter(Boolean);
  return lines.length ? lines : [value].filter(Boolean);
}

function isUsableLink(link: string): boolean {
  return Boolean(link && link !== "#");
}

function ActionLink({
  href,
  label,
  detail,
  tone,
  tall = false,
}: {
  href: string;
  label: string;
  detail: string;
  tone: string;
  tall?: boolean;
}) {
  const className = `today-action${tall ? " is-tall" : ""}`;
  const style = { "--action-color": tone } as CSSProperties;
  if (!isUsableLink(href)) {
    return (
      <div className={`${className} is-disabled`} style={style} aria-disabled="true">
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
    );
  }
  return (
    <a className={className} style={style} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>
      <strong>{label}</strong>
      <span>{detail}</span>
    </a>
  );
}

export default function TodayPage() {
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [videoPaused, setVideoPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    async function load() {
      const preview = new URLSearchParams(window.location.search).get("preview") === "1";
      if (preview) {
        setLesson(RATIO_PREVIEW);
        setDate(RATIO_PREVIEW.date);
        setLoading(false);
        return;
      }
      try {
        const response = await fetch("/api/today", { cache: "no-store" });
        const data = await response.json() as { lesson: LessonData | null; date: string; error?: string };
        if (!response.ok || data.error) setError(data.error || "Today's lesson could not be loaded.");
        else {
          setLesson(data.lesson);
          setDate(data.date);
        }
      } catch {
        setError("Today's lesson could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function toggleVideo() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setVideoPaused(false);
    } else {
      video.pause();
      setVideoPaused(true);
    }
  }

  const ideas = lesson ? splitIdeas(lesson.essentialIdeas) : [];
  const criteria = lesson ? splitCriteria(lesson.successCriteria) : [];
  const ratioLesson = Boolean(lesson && /ratio/i.test(`${lesson.lessonCode} ${lesson.title} ${lesson.subtitle}`));
  const videoSource = lesson?.explainerVideo || (ratioLesson ? "/lesson-videos/ratios-bigdogmath.mp4" : "");

  return (
    <main className="today-root">
      <style>{`
        .today-root { min-height:100vh; display:grid; grid-template-rows:auto 1fr; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); }
        .today-topbar { min-height:68px; display:grid; grid-template-columns:auto auto 1fr; align-items:center; gap:30px; border-bottom:1px solid var(--bdb-line); padding:0 clamp(20px,2.5vw,34px); background:rgba(255,255,255,0.86); }
        .today-brand { margin:0; color:var(--bdb-brown); font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; }
        .today-nav-label { color:var(--bdb-teal); font-size:0.72rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .today-date { justify-self:end; color:var(--bdb-ink-soft); font-size:0.78rem; font-weight:800; text-transform:uppercase; }
        .today-shell { width:min(100%,1440px); margin:0 auto; display:grid; grid-template-columns:minmax(0,1.78fr) minmax(340px,0.92fr); gap:26px; padding:12px 32px 28px; }
        .today-primary { min-width:0; display:grid; align-content:start; gap:10px; }
        .today-heading { min-height:66px; display:flex; align-items:center; justify-content:space-between; gap:16px; border-radius:var(--bdb-r); background:rgba(255,255,255,0.88); padding:8px 20px; }
        .today-kicker { margin:0 0 3px; color:var(--bdb-teal); font-size:0.66rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .today-title { margin:0; font-size:clamp(1.75rem,3vw,2.35rem); line-height:1; letter-spacing:-0.035em; }
        .today-preview { color:var(--bdb-ink-soft); font-size:0.72rem; font-weight:750; white-space:nowrap; }
        .today-video-wrap { position:relative; width:min(76%,650px); margin:0 auto; aspect-ratio:16 / 9; overflow:visible; border-radius:0; background:transparent; box-shadow:none; }
        .today-video { width:100%; height:100%; display:block; object-fit:cover; background:var(--bdb-ground-2); }
        .today-video-control { position:absolute; right:-90px; bottom:8px; min-height:38px; border:0; border-radius:var(--bdb-r-pill); background:rgba(255,255,255,0.94); color:var(--bdb-ink); padding:0 18px; font:inherit; font-size:0.7rem; font-weight:900; text-transform:uppercase; cursor:pointer; box-shadow:var(--bdb-shadow-sm); }
        .today-video-missing { height:100%; display:grid; place-items:center; padding:30px; color:var(--bdb-ink-soft); font-weight:800; text-align:center; }
        .today-lesson-info { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(230px,0.72fr); gap:18px; border:1px solid var(--bdb-line); border-radius:var(--bdb-r); background:rgba(255,255,255,0.86); padding:16px 18px; }
        .today-info-card { min-width:0; padding:0; }
        .today-info-card h2 { margin:0 0 12px; color:var(--bdb-ink-faint); font-size:0.68rem; letter-spacing:0.1em; text-transform:uppercase; }
        .today-bullets { margin:0; display:grid; gap:7px; padding-left:19px; color:var(--bdb-ink-soft); font-size:0.94rem; line-height:1.42; font-weight:650; }
        .today-mini-model { min-width:0; border:1px solid var(--bdb-line); border-radius:var(--bdb-r); background:var(--bdb-ground-2); padding:12px 14px; }
        .today-sidebar { min-width:0; display:grid; align-content:start; gap:0; border:1px solid var(--bdb-line); border-radius:var(--bdb-r); background:rgba(255,255,255,0.86); padding:10px 18px; }
        .today-support { border-bottom:1px solid var(--bdb-line); padding:8px 0 11px; }
        .today-support-label { margin:0 0 7px; color:var(--bdb-ink-faint); font-size:0.66rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .today-support-copy { margin:0; color:var(--bdb-ink); font-size:1rem; line-height:1.35; font-weight:800; }
        .today-criteria { margin:0; display:grid; gap:5px; padding-left:17px; color:var(--bdb-ink-soft); font-size:0.78rem; line-height:1.28; font-weight:680; }
        .today-vocab { display:flex; flex-wrap:wrap; gap:6px; }
        .today-vocab span { border-radius:var(--bdb-r-pill); background:var(--bdb-ground-2); color:var(--bdb-brown); padding:6px 9px; font-size:0.7rem; font-weight:850; }
        .today-actions { display:grid; gap:7px; padding-top:9px; }
        .today-action { min-height:47px; display:grid; align-content:center; gap:2px; border:1px solid color-mix(in srgb,var(--action-color) 72%,#6f675c); border-radius:12px; background:var(--action-color); color:#fff; padding:8px 14px; box-shadow:none; }
        .today-action.is-tall { min-height:74px; }
        .today-action strong { font-size:1rem; line-height:1.1; }
        .today-action span { color:rgba(255,255,255,0.82); font-size:0.72rem; font-weight:750; }
        .today-action.is-disabled { opacity:0.5; filter:saturate(0.55); }
        .today-state { grid-column:1 / -1; min-height:58vh; display:grid; place-items:center; text-align:center; padding:30px; }
        .today-state div { max-width:540px; }
        .today-state h1 { margin:0 0 10px; font-size:clamp(1.8rem,4vw,3rem); }
        .today-state p { margin:0; color:var(--bdb-ink-soft); line-height:1.5; }
        .today-error { margin-top:14px; border:1px solid color-mix(in srgb,var(--bdb-coral) 38%,var(--bdb-line)); border-radius:12px; background:#fff5f1; color:#9c3422; padding:12px 14px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.8rem; text-align:left; }
        @media (max-width:920px) {
          .today-shell { grid-template-columns:1fr; }
          .today-sidebar { grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
          .today-support { border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:14px; }
          .today-actions { grid-column:1 / -1; grid-template-columns:repeat(2,minmax(0,1fr)); padding-top:0; }
          .today-action.is-tall { min-height:74px; }
        }
        @media (max-width:620px) {
          .today-topbar { grid-template-columns:1fr auto; }
          .today-nav-label { display:none; }
          .today-shell { padding:14px; }
          .today-heading { display:grid; }
          .today-preview { display:none; }
          .today-lesson-info, .today-sidebar, .today-actions { grid-template-columns:1fr; }
          .today-video-wrap { width:100%; aspect-ratio:16 / 10; overflow:hidden; }
          .today-video-control { right:10px; }
        }
      `}</style>

      <header className="today-topbar">
        <p className="today-brand">Big Dog Math</p>
        <span className="today-nav-label">Today&apos;s lesson</span>
        <span className="today-date">{date ? formatDate(date) : "Today's lesson"}</span>
      </header>

      {loading ? (
        <section className="today-state"><div><h1>Loading today&apos;s lesson</h1><p>Connecting to the published Math 6 lesson.</p></div></section>
      ) : error ? (
        <section className="today-state"><div><h1>Today&apos;s lesson is not ready</h1><p>Try again after the lesson is published and dated for today.</p><div className="today-error">{error}</div></div></section>
      ) : !lesson ? (
        <section className="today-state"><div><h1>No lesson is published today</h1><p>Publish the lesson in Math 6 Lessons and set its date to today.</p></div></section>
      ) : (
        <div className="today-shell">
          <section className="today-primary">
            <div className="today-heading">
              <div>
                <p className="today-kicker">{lesson.lessonCode || lesson.standard || lesson.topic}</p>
                <h1 className="today-title">{ratioLesson ? "Ratios are everywhere." : lesson.title}</h1>
              </div>
              <span className="today-preview">Preview now · replay at home</span>
            </div>

            <div className="today-video-wrap">
              {videoSource ? (
                <>
                  <video ref={videoRef} className="today-video" src={videoSource} autoPlay muted loop playsInline preload="metadata" />
                  <button className="today-video-control" onClick={toggleVideo}>{videoPaused ? "Play loop" : "Pause loop"}</button>
                </>
              ) : <div className="today-video-missing">A silent visual explainer can be added to this lesson in Notion.</div>}
            </div>

            <div className="today-lesson-info">
              <article className="today-info-card">
                <h2>What to notice</h2>
                <ul className="today-bullets">
                  {(ideas.length ? ideas : [lesson.subtitle]).filter(Boolean).map((idea) => <li key={idea}>{idea}</li>)}
                </ul>
              </article>
              {ratioLesson && <aside className="today-mini-model"><RatioBuilder compact kicker="Try the model" prompt="Drag blocks to build a ratio." /></aside>}
            </div>
          </section>

          <aside className="today-sidebar">
            <section className="today-support">
              <p className="today-support-label">Learning intention</p>
              <p className="today-support-copy">{lesson.learningIntention || lesson.essentialIdeas}</p>
            </section>
            <section className="today-support">
              <p className="today-support-label">What success looks like</p>
              <ul className="today-criteria">
                {(criteria.length ? criteria : ideas.slice(0, 3)).map((criterion) => <li key={criterion}>{criterion}</li>)}
              </ul>
            </section>
            {ratioLesson && (
              <section className="today-support">
                <p className="today-support-label">Vocabulary</p>
                <div className="today-vocab">{RATIO_VOCABULARY.map((word) => <span key={word}>{word}</span>)}</div>
              </section>
            )}
            <div className="today-actions">
              <ActionLink href={lesson.warmUpLink} label="Warm-Up" detail="Open the verified Google Form" tone="#e66b32" tall />
              <ActionLink href="/join" label="Join class" detail="Enter the code shown by your teacher" tone="#211f1b" />
              <ActionLink href={lesson.assignmentLink} label="Paper assignment" detail="Open the printable Carnegie-based practice" tone="#50a3a4" />
              <ActionLink href={lesson.exitTicketLink} label="Exit ticket" detail="Open when your teacher says to begin" tone="#2f9e6f" />
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
