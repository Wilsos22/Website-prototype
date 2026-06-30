"use client";

// Teacher: read SBAC checkpoint results. Each checkpoint is auto-graded against
// the answer key, so this shows mastery by standard — class accuracy, who got it,
// and which misconception is showing up most. The read that drives reteaching.

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import SiteNav from "@/components/SiteNav";
import {
  listCheckpointRuns,
  getCheckpointResults,
  type CheckpointRun,
  type CheckpointResultRow,
} from "@/lib/checkpoints";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function TeacherCheckpointsPage() {
  const supabase = getSupabase();
  const [runs, setRuns] = useState<CheckpointRun[]>([]);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<CheckpointRun | null>(null);
  const [results, setResults] = useState<CheckpointResultRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    (async () => {
      const { runs: rows, missing: miss } = await listCheckpointRuns(supabase);
      setMissing(miss); setRuns(rows); setLoading(false);
    })();
  }, [supabase]);

  const openRun = useCallback(async (run: CheckpointRun) => {
    if (!supabase) return;
    setOpen(run); setDetailLoading(true); setResults([]);
    setResults(await getCheckpointResults(supabase, run.id));
    setDetailLoading(false);
  }, [supabase]);

  const correct = results.filter((r) => r.is_correct).length;
  const acc = results.length ? Math.round((correct / results.length) * 100) : 0;
  const missMap = new Map<string, number>();
  results.filter((r) => !r.is_correct && r.misconception).forEach((r) => {
    missMap.set(r.misconception!, (missMap.get(r.misconception!) || 0) + 1);
  });
  const misconceptions = Array.from(missMap.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <main className="cp">
      <style>{styles}</style>
      <SiteNav variant="teacher" />
      <div className="cp-wrap">
        <h1 className="cp-h1">SBAC Checkpoints</h1>
        <p className="cp-sub">Auto-graded checkpoint results — mastery by standard, and the misconception to reteach.</p>

        {!supabase && <div className="cp-warn">Supabase isn&apos;t connected yet — add your keys in Vercel and redeploy.</div>}
        {missing && <div className="cp-warn">Run <b>supabase/checkpoints.sql</b> in the Supabase SQL editor to start collecting checkpoint data.</div>}
        {loading && <p className="cp-soft">Loading…</p>}
        {!loading && supabase && !missing && runs.length === 0 && (
          <div className="cp-card"><p className="cp-soft">No checkpoints yet. Add the <b>✅ SBAC Checkpoint</b> state to a lesson and send one during class.</p></div>
        )}

        {!open && runs.length > 0 && (
          <div className="cp-list">
            {runs.map((run) => (
              <button key={run.id} className="cp-row" onClick={() => openRun(run)}>
                <span className="cp-row-tag">{run.ccss || run.checkpoint_id}</span>
                <span className="cp-row-main">
                  <span className="cp-row-title">{run.prompt}</span>
                  <span className="cp-row-meta">{run.checkpoint_id} · {fmtWhen(run.created_at)}{run.status === "open" ? " · open" : ""}</span>
                </span>
                <span className="cp-row-go">View →</span>
              </button>
            ))}
          </div>
        )}

        {open && (
          <>
            <button className="cp-back" onClick={() => setOpen(null)}>← All checkpoints</button>
            <div className="cp-card">
              <div className="cp-d-head">
                <div>
                  <div className="cp-d-title">{open.prompt}</div>
                  <div className="cp-row-meta">{open.checkpoint_id}{open.ccss ? ` · ${open.ccss}` : ""} · answer key: <b>{open.correct_answer}</b></div>
                </div>
                {!detailLoading && results.length > 0 && (
                  <div className="cp-d-stat"><b>{acc}%</b><span>correct</span></div>
                )}
              </div>
            </div>

            {detailLoading ? <p className="cp-soft">Loading…</p> : results.length === 0 ? (
              <div className="cp-card"><p className="cp-soft">No answers recorded yet.</p></div>
            ) : (
              <>
                {misconceptions.length > 0 && (
                  <div className="cp-card">
                    <h3 className="cp-ch">Misconceptions showing up</h3>
                    <div className="cp-miss">
                      {misconceptions.map(([m, n]) => (
                        <div className="cp-miss-row" key={m}>
                          <span className="cp-miss-label">{m}</span>
                          <span className="cp-miss-n">{n} {n === 1 ? "student" : "students"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="cp-card">
                  <h3 className="cp-ch">By student</h3>
                  <div className="cp-students">
                    {results.slice().sort((a, b) => Number(a.is_correct) - Number(b.is_correct)).map((r) => (
                      <div className={`cp-st-row${r.is_correct ? "" : " flag"}`} key={r.id}>
                        <span className="cp-st-name">{r.display_name || "Student"}</span>
                        <span className="cp-st-ans">{r.answer}</span>
                        <span className="cp-st-mark">{r.is_correct ? "✓" : (r.misconception ? `✗ ${r.misconception}` : "✗")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

const styles = `
  .cp { min-height:100vh; background:var(--bdb-ground); font-family:var(--bdb-font); color:var(--bdb-ink); padding-bottom:50px; }
  .cp-wrap { max-width:760px; margin:0 auto; padding:0 16px; display:grid; gap:14px; }
  .cp-h1 { font-size:clamp(1.7rem,5vw,2.4rem); font-weight:800; letter-spacing:-0.02em; margin:8px 0 0; }
  .cp-sub { color:var(--bdb-ink-soft); font-weight:500; margin:0; }
  .cp-soft { color:var(--bdb-ink-soft); font-weight:500; }
  .cp-warn { background:#fff7e6; border:1px solid #ffe2a8; color:#92660a; border-radius:14px; padding:14px 16px; font-weight:600; }
  .cp-card { background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r-lg); box-shadow:var(--bdb-shadow-sm); padding:18px 20px; }
  .cp-list { display:grid; gap:8px; }
  .cp-row { display:flex; align-items:center; gap:13px; text-align:left; width:100%; background:var(--bdb-card); border:1px solid var(--bdb-line); border-radius:var(--bdb-r); padding:14px 16px; cursor:pointer; box-shadow:var(--bdb-shadow-sm); }
  .cp-row:hover { border-color:var(--bdb-teal); }
  .cp-row-tag { font-size:0.72rem; font-weight:900; color:#0f766e; background:#e7f8f3; border:1px solid #b9ebdf; border-radius:999px; padding:5px 9px; white-space:nowrap; }
  .cp-row-main { display:flex; flex-direction:column; flex:1; min-width:0; }
  .cp-row-title { font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cp-row-meta { font-size:0.82rem; color:var(--bdb-ink-faint); font-weight:600; }
  .cp-row-go { font-weight:800; color:var(--bdb-teal); font-size:0.88rem; }
  .cp-back { align-self:flex-start; background:none; border:none; color:var(--bdb-ink-soft); font-weight:800; cursor:pointer; font-size:0.9rem; padding:4px 0; }
  .cp-d-head { display:flex; align-items:center; justify-content:space-between; gap:14px; }
  .cp-d-title { font-size:1.15rem; font-weight:900; }
  .cp-d-stat { text-align:right; } .cp-d-stat b { display:block; font-size:1.7rem; font-weight:900; color:var(--bdb-teal); }
  .cp-d-stat span { font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--bdb-ink-faint); }
  .cp-ch { margin:0 0 12px; font-size:1.05rem; font-weight:900; }
  .cp-miss { display:flex; flex-direction:column; gap:7px; }
  .cp-miss-row { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 13px; border-radius:11px; background:color-mix(in srgb, var(--bdb-coral) 8%, white); }
  .cp-miss-label { font-weight:800; color:var(--bdb-ink); }
  .cp-miss-n { font-weight:800; color:var(--bdb-coral); font-size:0.85rem; white-space:nowrap; }
  .cp-students { display:flex; flex-direction:column; gap:6px; }
  .cp-st-row { display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:11px; background:var(--bdb-ground); }
  .cp-st-row.flag { background:color-mix(in srgb, var(--bdb-coral) 9%, white); }
  .cp-st-name { width:140px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cp-st-ans { flex:1; font-weight:700; color:var(--bdb-ink-soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cp-st-mark { font-weight:800; font-size:0.84rem; text-align:right; }
`;
