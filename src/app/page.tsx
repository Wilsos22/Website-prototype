// Teacher home screen: a large touch-friendly launcher for each prototype tool.
import Link from "next/link";

const tools = [
  { href: "/today", label: "Today's Lesson", badge: "student" },
  { href: "/lessons", label: "Past Lessons", badge: "student" },
  { href: "/join", label: "Join Session", badge: "student" },
  { href: "/start-question", label: "Start Question", badge: "teacher" },
  { href: "/whiteboard", label: "Whiteboard", badge: "teacher" },
  { href: "/algebra-tiles", label: "Algebra Tiles", badge: "teacher" },
  { href: "/equation-builder", label: "Equation Builder", badge: "teacher" },
  { href: "/order-of-operations", label: "GEMS (Order of Ops)", badge: "teacher" },
  { href: "/combine-like-terms", label: "Combine Like Terms", badge: "teacher" },
  { href: "/group-bars", label: "Group Bars (% · dec · frac)", badge: "teacher" },
  { href: "/proportions", label: "Proportion Builder", badge: "teacher" },
  { href: "/fraction-bars", label: "Fraction Bars", badge: "teacher" },
  { href: "/number-line", label: "Number Line", badge: "teacher" },
  { href: "/timer", label: "Timer", badge: "teacher" },
  { href: "/control", label: "Classroom Control", badge: "teacher" },
  { href: "/spinner", label: "Student Spinner", badge: "teacher" },
];

export default function HomePage() {
  return (
    <main className="app-page home-page">
      <section className="brand-block" aria-labelledby="home-title">
        <div className="brand-mark" aria-hidden="true">
          BDB
        </div>
        <h1 id="home-title" className="brand-title">
          Big Dog Board
        </h1>
        <p className="brand-subtitle">
          Classroom display tools for drawing, modeling, quick responses, and time.
        </p>
      </section>

      <nav className="launch-grid" aria-label="Classroom tools">
        {tools.map((tool) => (
          <Link key={tool.href} className="launch-button" href={tool.href}>
            <span style={{ fontSize: "0.6rem", fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.45, display: "block", marginBottom: "4px" }}>
              {tool.badge}
            </span>
            {tool.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
