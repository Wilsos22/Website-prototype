"use client";

// Student-facing list of open practice assignments, shown on the Explore hub.
// Renders nothing until it finds open assignments, so it stays out of the way
// when there's no homework. Tapping one opens the assignment player.

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { getSkill } from "@/lib/challengeSkills";
import { listAssignments, type Assignment } from "@/lib/assignments";

export default function StudentAssignments() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let stop = false;
    (async () => {
      const { assignments: rows } = await listAssignments(supabase);
      if (!stop) setAssignments(rows);
    })();
    return () => { stop = true; };
  }, []);

  if (assignments.length === 0) return null;

  return (
    <>
      <style>{`
        .sa-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px; }
        .sa-card { display:flex; align-items:center; gap:13px; text-decoration:none; background:var(--bdb-card);
          border:1px solid var(--bdb-line); border-left:5px solid var(--bdb-amber); border-radius:var(--bdb-r);
          padding:15px 16px; box-shadow:var(--bdb-shadow-sm); transition:transform 120ms ease, box-shadow 120ms ease; }
        .sa-card:hover { transform:translateY(-2px); box-shadow:var(--bdb-shadow); }
        .sa-emoji { font-size:1.7rem; flex:none; }
        .sa-label { display:block; font-weight:800; color:var(--bdb-ink); letter-spacing:-0.01em; }
        .sa-meta { display:block; font-size:0.82rem; color:var(--bdb-ink-soft); font-weight:600; margin-top:2px; }
        .sa-go { margin-left:auto; font-size:1.3rem; font-weight:800; color:var(--bdb-amber); }
      `}</style>
      <h2 className="ex-h2">Assigned practice</h2>
      <div className="sa-grid">
        {assignments.map((a) => {
          const skill = getSkill(a.skill);
          return (
            <a key={a.id} className="sa-card" href={`/assignment/${a.id}`}>
              <span className="sa-emoji">{skill?.emoji || "📝"}</span>
              <span>
                <span className="sa-label">{a.title}</span>
                <span className="sa-meta">{a.target_rounds} rounds{a.due_label ? ` · ${a.due_label}` : ""}</span>
              </span>
              <span className="sa-go" aria-hidden="true">→</span>
            </a>
          );
        })}
      </div>
    </>
  );
}
