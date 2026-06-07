// Teacher home screen: a large touch-friendly launcher for each prototype tool.
import Link from "next/link";

const tools = [
  { href: "/whiteboard", label: "Whiteboard" },
  { href: "/algebra-tiles", label: "Algebra Tiles" },
  { href: "/fraction-bars", label: "Fraction Bars" },
  { href: "/number-line", label: "Number Line" },
  { href: "/start-question", label: "Start Question" },
  { href: "/timer", label: "Timer" },
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

      <nav className="launch-grid" aria-label="Teacher tools">
        {tools.map((tool) => (
          <Link key={tool.href} className="launch-button" href={tool.href}>
            {tool.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
