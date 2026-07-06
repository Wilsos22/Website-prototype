// Manipulative-tool evidence emitter — the tools call reportToolResult() once
// per completed problem, and the day's work flows into the proficiency spine:
//   · ONE aggregate row per (student × tool × day), upserted as they work —
//     score 0–5 accuracy + the day's most-frequent misconception tag → moves
//     the domain mastery bar at warm-up weight and feeds archetype grouping.
//   · A per-problem row when the tool maps to a seeded standard (GEMS →
//     6.EE.A.1, Combine Like Terms → 6.EE.A.3) → feeds the per-standard stage
//     gates (excluded from the bars, so no double-counting).
// Only fires when this device has JOINED A LIVE SESSION (localStorage
// bdm-student-session) — free play doesn't write evidence. Fire-and-forget:
// never blocks or breaks the tool.
import { getSupabase } from "@/lib/supabase";

export type EvidenceTool = "equation-builder" | "gems" | "combine-like-terms";

const TOOL_DOMAIN: Record<EvidenceTool, string> = {
  "equation-builder": "Algebra and Algebraic Thinking",
  "gems": "Algebra and Algebraic Thinking",
  "combine-like-terms": "Algebra and Algebraic Thinking",
};

export interface ToolResult {
  tool: EvidenceTool;
  correct: boolean; // solved with zero wrong steps
  standardId?: string; // seeded CCSS code, when the tool maps to one
  misconception?: string | null; // vocabulary tag for the wrong-step pattern
  problemId?: string; // stable id/text of the problem (dedupes re-fires)
}

interface Tally { a: number; c: number; tags: Record<string, number> }

function readSession(): { sessionId: string; studentId: string } | null {
  try {
    const raw = localStorage.getItem("bdm-student-session");
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.sessionId && s.studentId ? s : null;
  } catch { return null; }
}

export function reportToolResult(r: ToolResult): void {
  try {
    const session = readSession();
    const supabase = getSupabase();
    if (!session || !supabase) return;

    const date = new Date().toISOString().slice(0, 10);
    const tallyKey = `bdm-tooltally:${r.tool}:${session.studentId}:${date}`;
    let tally: Tally = { a: 0, c: 0, tags: {} };
    try { tally = JSON.parse(localStorage.getItem(tallyKey) || "") || tally; } catch { /* fresh */ }
    tally.a += 1;
    if (r.correct) tally.c += 1;
    if (r.misconception) tally.tags[r.misconception] = (tally.tags[r.misconception] || 0) + 1;
    try { localStorage.setItem(tallyKey, JSON.stringify(tally)); } catch { /* ignore */ }

    const topTag = Object.keys(tally.tags).sort((a, b) => tally.tags[b] - tally.tags[a])[0] || null;
    const now = new Date().toISOString();

    // Aggregate row (updates in place all period long).
    void supabase.from("responses").upsert({
      student_id: session.studentId,
      session_id: session.sessionId,
      problem_id: null,
      source: "tool",
      domain: TOOL_DOMAIN[r.tool],
      standard_id: null,
      score: Math.round((5 * tally.c / tally.a) * 100) / 100,
      is_correct: null,
      misconception: topTag,
      item_ref: r.tool,
      dedupe_key: `tool:${r.tool}:agg:${session.studentId}:${date}`,
      graded_by: "tool",
      submitted_at: now,
    }, { onConflict: "dedupe_key" }).then(({ error }) => {
      if (error) console.debug("tool evidence (agg):", error.message);
    });

    // Per-problem stage evidence, only when a seeded standard applies.
    if (r.standardId) {
      const pid = r.problemId || `${Date.now()}`;
      void supabase.from("responses").upsert({
        student_id: session.studentId,
        session_id: session.sessionId,
        problem_id: null,
        source: "tool",
        domain: TOOL_DOMAIN[r.tool],
        standard_id: r.standardId,
        score: null,
        is_correct: r.correct,
        misconception: r.misconception || null,
        item_ref: `${r.tool}:${pid}`,
        dedupe_key: `tool:${r.tool}:q:${session.studentId}:${date}:${pid}`,
        graded_by: "tool",
        submitted_at: now,
      }, { onConflict: "dedupe_key", ignoreDuplicates: true }).then(({ error }) => {
        if (error) console.debug("tool evidence (q):", error.message);
      });
    }
  } catch { /* evidence must never break the tool */ }
}
