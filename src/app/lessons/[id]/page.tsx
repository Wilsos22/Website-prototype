"use client";

// Archived lesson detail - the page a /lessons card opens. Read-only review
// of a published lesson in the Warm Notebook look: what we learned, the
// success criterion, the plan, and the assignment. Live-class surfaces
// (warm-up and exit forms) deliberately do not appear here.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface ArchivedLesson {
  id: string;
  lessonCode: string;
  title: string;
  subtitle: string;
  essentialIdeas: string;
  assignmentLink: string;
  date: string;
  dueDate: string;
  module: string;
  topic: string;
  standard: string;
  agenda: string;
  supplies: string;
  learningIntention: string;
  selectedSuccessCriterion: string;
  requiredPaperWork: string;
  requiredDigitalWork: string;
  bigDogChallenge: string;
}

function formatDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function lines(value: string): string[] {
  return (value || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

export default function ArchivedLessonPage() {
  const params = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<ArchivedLesson | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    if (!params?.id) return;
    let stopped = false;
    fetch(`/api/lessons/${encodeURIComponent(params.id)}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (stopped) return;
        if (data?.lesson) {
          setLesson(data.lesson as ArchivedLesson);
          setState("ready");
        } else {
          setState("missing");
        }
      })
      .catch(() => { if (!stopped) setState("missing"); });
    return () => { stopped = true; };
  }, [params?.id]);

  return (
    <main className="la-page">
      <style>{`
        .la-page { min-height:100vh;
          background-color:#F3F0E7;
          background-image:radial-gradient(circle,#CBC4B2 1px,transparent 1.3px);
          background-size:18px 18px;
          font-family:var(--bdb-font); color:var(--bdb-ink);
          padding:clamp(18px,4vw,44px) 16px 60px; box-sizing:border-box;
          display:flex; flex-direction:column; align-items:center; }
        .la-wrap { width:100%; max-width:820px; display:grid; gap:14px; }
        .la-back { justify-self:start; display:inline-flex; align-items:center; min-height:38px;
          border:1px solid #E3D9C2; border-radius:999px; background:#fff; color:var(--bdb-ink-soft);
          padding:0 16px; text-decoration:none; font-size:0.82rem; font-weight:800; }
        .la-back:hover { border-color:var(--bdb-teal); color:var(--bdb-ink); }
        .la-chips { display:flex; flex-wrap:wrap; gap:7px; }
        .la-chip { border:1px solid #E3D9C2; border-radius:999px; background:#F6F3EC; color:var(--bdb-ink);
          padding:6px 11px; font-size:0.76rem; font-weight:800; }
        .la-title { margin:0; color:#2E4A54; font-size:clamp(1.6rem,4vw,2.4rem); font-weight:800; line-height:1.1; letter-spacing:-0.02em; }
        .la-subtitle { margin:0; color:var(--bdb-ink-soft); font-size:clamp(0.95rem,1.8vw,1.1rem); font-weight:600; }
        .la-card { border:1px solid #E3D9C2; border-radius:16px; background:#fff; padding:18px 20px;
          box-shadow:0 2px 10px rgba(40,32,20,0.06); display:grid; gap:8px; }
        .la-card.accent { border-left:5px solid var(--bdb-teal); }
        .la-label { margin:0; color:#2A6162; font-size:0.68rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .la-body { margin:0; color:var(--bdb-ink); font-size:clamp(0.95rem,1.6vw,1.08rem); font-weight:650; line-height:1.5; white-space:pre-wrap; }
        .la-list { display:grid; gap:8px; margin:0; padding:0; list-style:none; }
        .la-list li { display:flex; gap:10px; align-items:baseline; color:var(--bdb-ink);
          font-size:clamp(0.92rem,1.5vw,1.02rem); font-weight:650; line-height:1.4; }
        .la-list .n { flex:none; min-width:1.5ch; color:#2A6162; font-weight:800; font-variant-numeric:tabular-nums; }
        .la-assignment { display:inline-flex; align-items:center; justify-content:center; min-height:50px;
          border-radius:12px; background:var(--bdb-teal); color:#fff; padding:0 22px; text-decoration:none;
          font-size:0.98rem; font-weight:800; box-shadow:0 4px 16px rgba(40,32,20,0.12); justify-self:start; }
        .la-assignment:hover { filter:brightness(1.04); }
        .la-status { margin:60px 0; color:var(--bdb-ink-soft); font-weight:700; text-align:center; }
        .la-status a { color:var(--bdb-ink); }
      `}</style>

      <div className="la-wrap">
        <a className="la-back" href="/lessons">All lessons</a>

        {state === "loading" ? (
          <p className="la-status">Loading the lesson.</p>
        ) : state === "missing" || !lesson ? (
          <p className="la-status">That lesson is not published. <a href="/lessons">Back to all lessons.</a></p>
        ) : (
          <>
            <div className="la-chips">
              {lesson.date ? <span className="la-chip">{formatDate(lesson.date)}</span> : null}
              {lesson.lessonCode ? <span className="la-chip">{lesson.lessonCode}</span> : null}
              {lesson.module ? <span className="la-chip">{lesson.module}</span> : null}
              {lesson.standard ? <span className="la-chip">{lesson.standard}</span> : null}
            </div>
            <h1 className="la-title">{lesson.title}</h1>
            {lesson.subtitle ? <p className="la-subtitle">{lesson.subtitle}</p> : null}

            {lesson.learningIntention ? (
              <section className="la-card accent">
                <p className="la-label">We are learning</p>
                <p className="la-body">{lesson.learningIntention}</p>
                {lesson.selectedSuccessCriterion ? <p className="la-body"><b>Success criterion:</b> {lesson.selectedSuccessCriterion}</p> : null}
              </section>
            ) : null}

            {lesson.essentialIdeas ? (
              <section className="la-card">
                <p className="la-label">Essential ideas</p>
                <p className="la-body">{lesson.essentialIdeas}</p>
              </section>
            ) : null}

            {lines(lesson.agenda).length ? (
              <section className="la-card">
                <p className="la-label">The plan</p>
                <ul className="la-list">
                  {lines(lesson.agenda).map((item, index) => (
                    <li key={item}><span className="n">{index + 1}</span>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {lesson.requiredPaperWork || lesson.requiredDigitalWork ? (
              <section className="la-card">
                <p className="la-label">Required work</p>
                {lesson.requiredPaperWork ? <p className="la-body">{lesson.requiredPaperWork}</p> : null}
                {lesson.requiredDigitalWork ? <p className="la-body">{lesson.requiredDigitalWork}</p> : null}
              </section>
            ) : null}

            {lesson.bigDogChallenge ? (
              <section className="la-card">
                <p className="la-label">Big Dog Challenge</p>
                <p className="la-body">{lesson.bigDogChallenge}</p>
              </section>
            ) : null}

            {lesson.assignmentLink ? (
              <a className="la-assignment" href={lesson.assignmentLink} target="_blank" rel="noopener noreferrer">
                Open the assignment
              </a>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
