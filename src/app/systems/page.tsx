import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Systems Case Study | Big Dog Math",
  description:
    "How Big Dog Math connects Notion curriculum planning, Google Forms warm-up automation, teacher controls, student lesson flow, analytics, and math manipulatives.",
};

const metrics = [
  { label: "Primary users", value: "Teacher + students" },
  { label: "System surfaces", value: "Planning, live class, practice, analytics" },
  { label: "Integrations", value: "Notion, Google Drive, Google Forms, Sheets" },
  { label: "Build style", value: "Working classroom-first prototype" },
];

const demoLinks = [
  { href: "/", label: "Student entry", desc: "Simple lesson and join-code flow" },
  { href: "/teacher", label: "Teacher dashboard", desc: "Tool launcher and classroom workspace" },
  { href: "/control", label: "Live control center", desc: "Teacher-paced lesson states and student sync" },
  { href: "/today", label: "Today page", desc: "Notion-powered student lesson view" },
  { href: "/teacher/analytics", label: "Warm-up analytics", desc: "Notion summaries with Google Forms links" },
  { href: "/fraction-bars", label: "Manipulative demo", desc: "Interactive fraction bars workspace" },
];

const automationSteps = [
  {
    title: "Plan the week",
    body: "The teacher selects a week number, start date, and daily topics. Apps Script turns those inputs into dated Math 6 warm-up form names and organized Drive folders.",
  },
  {
    title: "Generate Google Forms",
    body: "The generator copies a template form, builds daily question sets from the local problem bank, links each form to the response spreadsheet, and records edit, publish, and response-sheet URLs.",
  },
  {
    title: "Install submit triggers",
    body: "Each generated form gets a form-submit trigger. Submissions are exported to backup Sheets first so the workflow keeps an audit trail even when Notion sync has an issue.",
  },
  {
    title: "Sync into Notion",
    body: "Submission rows are upserted into Notion by a stable submission key. The sync links student records, warm-up records, scores, completion state, follow-up flags, and teacher notes.",
  },
  {
    title: "Review analytics",
    body: "The web app reads pre-computed Notion weekly summaries and recent form-link records, then gives the teacher completion, missing-work, score, and Google Forms summary links.",
  },
];

const architecture = [
  "Notion acts as the curriculum and analytics source of truth for lessons, warm-up links, students, submissions, and weekly summaries.",
  "Google Forms handles the student warm-up capture flow because it is reliable on school devices and already familiar to students.",
  "Google Sheets provides durable backup exports for generated form links and raw submissions.",
  "The Next.js app exposes the student lesson path, teacher dashboard, live control center, analytics, and math tools.",
  "Supabase supports live session concepts such as join codes, rosters, session broadcasts, polls, and student screen routing.",
];

export default function SystemsCaseStudyPage() {
  return (
    <main className="sys-page">
      <style>{`
        .sys-page {
          min-height: 100vh;
          background: var(--bdb-ground);
          color: var(--bdb-ink);
          font-family: var(--bdb-font);
        }
        .sys-shell {
          width: min(100% - 32px, 1120px);
          margin: 0 auto;
          padding: 28px 0 64px;
        }
        .sys-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 0 28px;
        }
        .sys-brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .sys-mark {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          background: var(--bdb-ink);
          color: var(--bdb-amber);
          font-weight: 900;
        }
        .sys-nav {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
          min-width: 0;
        }
        .sys-link {
          display: inline-flex;
          align-items: center;
          min-height: 38px;
          border: 1px solid var(--bdb-line);
          border-radius: var(--bdb-r-pill);
          background: var(--bdb-card);
          color: var(--bdb-ink-soft);
          padding: 0 15px;
          font-size: 0.86rem;
          font-weight: 700;
          text-decoration: none;
          box-shadow: var(--bdb-shadow-sm);
        }
        .sys-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
          gap: 22px;
          align-items: stretch;
        }
        .sys-hero-copy,
        .sys-panel,
        .sys-card,
        .sys-flow,
        .sys-route {
          background: var(--bdb-card);
          border: 1px solid var(--bdb-line);
          border-radius: var(--bdb-r);
          box-shadow: var(--bdb-shadow-sm);
        }
        .sys-hero-copy {
          padding: clamp(24px, 4vw, 42px);
        }
        .sys-eyebrow,
        .sys-section-label {
          margin: 0 0 12px;
          font-size: 0.74rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--bdb-ink-faint);
        }
        .sys-title {
          margin: 0;
          font-size: clamp(2.2rem, 6vw, 4.5rem);
          line-height: 0.95;
          letter-spacing: 0;
          max-width: 860px;
        }
        .sys-sub {
          margin: 18px 0 0;
          color: var(--bdb-ink-soft);
          font-size: clamp(1rem, 2vw, 1.25rem);
          line-height: 1.5;
          max-width: 760px;
        }
        .sys-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 24px;
        }
        .sys-action {
          display: inline-flex;
          align-items: center;
          min-height: 46px;
          border-radius: var(--bdb-r-sm);
          padding: 0 18px;
          font-weight: 800;
          text-decoration: none;
          border: 1px solid var(--bdb-line);
          background: var(--bdb-card);
        }
        .sys-action.primary {
          background: var(--bdb-coral);
          border-color: var(--bdb-coral);
          color: #fff;
        }
        .sys-panel {
          padding: 22px;
          display: grid;
          align-content: start;
          gap: 14px;
        }
        .sys-logo {
          width: 100%;
          max-width: 360px;
          border-radius: var(--bdb-r);
          justify-self: center;
          box-shadow: var(--bdb-shadow);
        }
        .sys-metrics {
          display: grid;
          gap: 10px;
        }
        .sys-metric {
          display: grid;
          gap: 3px;
          padding: 12px 14px;
          border-radius: var(--bdb-r-sm);
          background: var(--bdb-ground);
          border: 1px solid var(--bdb-line);
        }
        .sys-metric span:first-child {
          color: var(--bdb-ink-faint);
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .sys-metric span:last-child {
          color: var(--bdb-ink);
          font-weight: 800;
        }
        .sys-section {
          margin-top: 28px;
        }
        .sys-section-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 14px;
        }
        .sys-heading {
          margin: 0;
          font-size: clamp(1.4rem, 3vw, 2.1rem);
          letter-spacing: 0;
        }
        .sys-note {
          margin: 0;
          color: var(--bdb-ink-soft);
          line-height: 1.5;
          max-width: 620px;
        }
        .sys-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .sys-card {
          padding: 20px;
        }
        .sys-card h3,
        .sys-flow h3,
        .sys-route h3 {
          margin: 0 0 8px;
          font-size: 1.05rem;
          letter-spacing: 0;
        }
        .sys-card p,
        .sys-flow p,
        .sys-route p {
          margin: 0;
          color: var(--bdb-ink-soft);
          line-height: 1.48;
          font-size: 0.95rem;
        }
        .sys-flow-list {
          display: grid;
          gap: 12px;
        }
        .sys-flow {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr);
          gap: 16px;
          padding: 18px;
        }
        .sys-step {
          width: 44px;
          height: 44px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          background: color-mix(in srgb, var(--bdb-teal) 16%, white);
          color: #0f5e5f;
          font-weight: 900;
        }
        .sys-arch {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 14px;
        }
        .sys-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 10px;
        }
        .sys-list li {
          border: 1px solid var(--bdb-line);
          background: var(--bdb-card);
          border-radius: var(--bdb-r-sm);
          padding: 14px 16px;
          color: var(--bdb-ink-soft);
          line-height: 1.45;
          font-weight: 600;
        }
        .sys-routes {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .sys-route {
          padding: 17px;
          text-decoration: none;
          transition: transform 130ms ease, box-shadow 130ms ease, border-color 130ms ease;
        }
        .sys-route:hover {
          transform: translateY(-2px);
          border-color: color-mix(in srgb, var(--bdb-coral) 42%, var(--bdb-line));
          box-shadow: var(--bdb-shadow);
        }
        .sys-tech {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .sys-chip {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          border-radius: var(--bdb-r-pill);
          padding: 0 12px;
          background: var(--bdb-ground-2);
          color: var(--bdb-ink-soft);
          font-size: 0.84rem;
          font-weight: 800;
        }
        .sys-footer {
          margin-top: 34px;
          padding-top: 24px;
          border-top: 1px solid var(--bdb-line);
          color: var(--bdb-ink-faint);
          font-size: 0.9rem;
          font-weight: 700;
        }

        @media (max-width: 900px) {
          .sys-hero,
          .sys-arch {
            grid-template-columns: 1fr;
          }
          .sys-grid,
          .sys-routes {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 620px) {
          .sys-page {
            overflow-x: hidden;
          }
          .sys-shell {
            width: min(366px, calc(100vw - 24px));
            max-width: none;
            margin-left: 12px;
            margin-right: auto;
            padding-top: 18px;
          }
          .sys-top,
          .sys-section-head {
            align-items: flex-start;
            flex-direction: column;
          }
          .sys-nav {
            display: grid;
            grid-template-columns: 1fr;
            width: 100%;
          }
          .sys-link {
            justify-content: center;
            width: 100%;
          }
          .sys-hero,
          .sys-hero-copy,
          .sys-panel,
          .sys-section,
          .sys-card,
          .sys-flow,
          .sys-route {
            min-width: 0;
            max-width: 100%;
          }
          .sys-title {
            font-size: clamp(1.85rem, 9vw, 2.35rem);
            line-height: 1.05;
          }
          .sys-title,
          .sys-sub,
          .sys-note,
          .sys-card p,
          .sys-flow p,
          .sys-route p,
          .sys-list li,
          .sys-metric span {
            overflow-wrap: anywhere;
          }
          .sys-hero-copy,
          .sys-panel,
          .sys-card,
          .sys-flow {
            border-radius: var(--bdb-r-sm);
          }
          .sys-grid,
          .sys-routes {
            grid-template-columns: 1fr;
          }
          .sys-flow {
            grid-template-columns: 36px minmax(0, 1fr);
            gap: 12px;
          }
          .sys-step {
            width: 36px;
            height: 36px;
            border-radius: 11px;
          }
        }
      `}</style>

      <div className="sys-shell">
        <header className="sys-top">
          <Link className="sys-brand" href="/">
            <span className="sys-mark">b</span>
            <span>bigdogmath</span>
          </Link>
          <nav className="sys-nav" aria-label="Case study routes">
            <Link className="sys-link" href="/teacher">Teacher dashboard</Link>
            <Link className="sys-link" href="/today">Student lesson</Link>
            <Link className="sys-link" href="/control">Live control</Link>
          </nav>
        </header>

        <section className="sys-hero">
          <div className="sys-hero-copy">
            <p className="sys-eyebrow">Systems case study</p>
            <h1 className="sys-title">Math 6 classroom system.</h1>
            <p className="sys-sub">
              Big Dog Math connects daily lesson publishing, live class pacing, student-facing math tools,
              Google Forms warm-ups, Notion analytics, and teacher workflow automation into one classroom
              system.
            </p>
            <div className="sys-actions">
              <Link className="sys-action primary" href="/teacher/analytics">View warm-up analytics</Link>
              <Link className="sys-action" href="/today">Open student lesson</Link>
            </div>
          </div>
          <aside className="sys-panel" aria-label="Project summary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sys-logo" src="/big-dog-logo.png" alt="Big Dog Math logo" />
            <div className="sys-metrics">
              {metrics.map((metric) => (
                <div className="sys-metric" key={metric.label}>
                  <span>{metric.label}</span>
                  <span>{metric.value}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="sys-section">
          <div className="sys-section-head">
            <div>
              <p className="sys-section-label">What this demonstrates</p>
              <h2 className="sys-heading">A practical system, not just a screen.</h2>
            </div>
            <p className="sys-note">
              The work combines product design, classroom constraints, data modeling, integration design,
              and front-end implementation around a real repeated workflow.
            </p>
          </div>
          <div className="sys-grid">
            <article className="sys-card">
              <h3>Workflow design</h3>
              <p>Separate paths for students, teachers, live instruction, absent students, and analytics keep each user focused on the next action.</p>
            </article>
            <article className="sys-card">
              <h3>Data systems</h3>
              <p>Lessons, warm-up links, submissions, students, summaries, and live sessions each have clear ownership and sync boundaries.</p>
            </article>
            <article className="sys-card">
              <h3>Automation</h3>
              <p>Weekly warm-ups are generated, organized, linked, backed up, synced, summarized, and surfaced without manual spreadsheet work.</p>
            </article>
          </div>
        </section>

        <section className="sys-section">
          <div className="sys-section-head">
            <div>
              <p className="sys-section-label">Notion + Google warm-up automation</p>
              <h2 className="sys-heading">From weekly plan to teacher-ready analytics.</h2>
            </div>
            <p className="sys-note">
              This is the strongest systems-design part of the project: Google handles form capture,
              Sheets preserve exports, Notion stores structured classroom records, and the app turns
              those records into a teacher triage view.
            </p>
          </div>
          <div className="sys-flow-list">
            {automationSteps.map((step, index) => (
              <article className="sys-flow" key={step.title}>
                <div className="sys-step">{index + 1}</div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="sys-section">
          <div className="sys-section-head">
            <div>
              <p className="sys-section-label">Architecture</p>
              <h2 className="sys-heading">Designed around dependable classroom tools.</h2>
            </div>
          </div>
          <div className="sys-arch">
            <ul className="sys-list">
              {architecture.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="sys-card">
              <h3>Implementation stack</h3>
              <p>
                The app is a Next.js and TypeScript front end with server routes for Notion-backed data,
                Supabase-backed live session behavior, and Google Apps Script automation for warm-up
                generation and response sync.
              </p>
              <div className="sys-tech" style={{ marginTop: 18 }}>
                {["Next.js", "TypeScript", "Notion API", "Google Apps Script", "Google Forms", "Google Sheets", "Supabase", "Vercel"].map((item) => (
                  <span className="sys-chip" key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="sys-section">
          <div className="sys-section-head">
            <div>
              <p className="sys-section-label">Live demo routes</p>
              <h2 className="sys-heading">Screens a reviewer can inspect.</h2>
            </div>
            <p className="sys-note">
              These routes show the student experience, teacher operations surface, live classroom control,
              Notion lesson publishing, warm-up analytics, and manipulative design.
            </p>
          </div>
          <div className="sys-routes">
            {demoLinks.map((link) => (
              <Link className="sys-route" href={link.href} key={link.href}>
                <h3>{link.label}</h3>
                <p>{link.desc}</p>
              </Link>
            ))}
          </div>
        </section>

        <footer className="sys-footer">
          Built as a working classroom prototype: narrow student flow, teacher tools separated from students,
          and automation layered onto existing classroom systems instead of replacing them.
        </footer>
      </div>
    </main>
  );
}
