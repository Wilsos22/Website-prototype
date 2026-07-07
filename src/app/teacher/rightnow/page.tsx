"use client";

// "Right now" — the live grouping view. One card per misconception cluster:
// who's in it, their archetype, and the differentiated next move for each
// sub-group. Plus the non-submitter (logistics) card. One glance → one move.

import { useCallback, useEffect, useMemo, useState } from "react";
import SiteNav from "@/components/SiteNav";
import { getSupabase } from "@/lib/supabase";
import { ARCHETYPE_LABEL, type Archetype } from "@/lib/grouping";

interface Period { id: string; name: string }
interface Member { name: string; archetype: Archetype; avg: number; occurrences: number }
interface Move { archetype: Archetype; students: string[]; move: string }
interface ClusterOut { misconception: string; domain: string | null; corroborated: number; size: number; students: Member[]; moves: Move[] }
interface NonSub { name: string; submitted: number; possible: number; avgWhenSubmitting: number }

// Parse the lesson's "Misconception Plans" lines: "tag :: prepared move".
function parsePlans(raw: string): Map<string, string> {
  const plans = new Map<string, string>();
  for (const line of (raw || "").split("\n")) {
    const i = line.indexOf("::");
    if (i === -1) continue;
    const tag = line.slice(0, i).trim().toLowerCase();
    const move = line.slice(i + 2).trim();
    if (tag && move) plans.set(tag, move);
  }
  return plans;
}

const ARCH_COLOR: Record<Archetype, string> = {
  high: "#22c55e", strong_misc: "#14b8a6", growth: "#4d8df6",
  leaper: "#8b5cf6", plateau: "#f5b915", low: "#ef4444", nonsub: "#9a6a00",
};

export default function RightNowPage() {
  const supabase = useMemo(() => getSupabase(), []);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [clusters, setClusters] = useState<ClusterOut[]>([]);
  const [nonSub, setNonSub] = useState<NonSub[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [plans, setPlans] = useState<Map<string, string>>(new Map());
  const [lessonTitle, setLessonTitle] = useState("");
  // AI-sharpened moves, keyed by `${misconception}|||${archetype}`.
  const [sharp, setSharp] = useState<Record<string, { move: string; loading: boolean; note?: string }>>({});

  // Today's lesson plans from Notion ("Misconception Plans" property).
  useEffect(() => {
    fetch("/api/today", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d?.lesson?.misconceptionPlans) {
        setPlans(parsePlans(d.lesson.misconceptionPlans));
        setLessonTitle(d.lesson.title || "");
      }
    }).catch(() => { /* plans are optional */ });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const [{ data: pData }, { data: sData }] = await Promise.all([
        supabase.from("periods").select("id,name").order("sort_order"),
        supabase.from("students").select("period_id"),
      ]);
      const counts = new Map<string, number>();
      for (const s of (sData as { period_id: string }[]) || []) counts.set(s.period_id, (counts.get(s.period_id) || 0) + 1);
      const ps = ((pData as Period[]) || []).map((p) => ({ ...p, name: `${p.name} · ${counts.get(p.id) || 0} students` }));
      setPeriods(ps);
      const fullest = [...ps].sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0))[0];
      if (fullest) setPeriodId(fullest.id);
    })();
  }, [supabase]);

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setStatus(null);
    try {
      const res = await fetch(`/api/live/groups?periodId=${encodeURIComponent(pid)}`, { cache: "no-store" });
      const d = await res.json();
      if (d.error) { setStatus(d.error); setClusters([]); setNonSub([]); }
      else {
        setClusters(d.clusters || []);
        setNonSub(d.nonSubmitters || []);
        if (!(d.clusters || []).length && !(d.nonSubmitters || []).length) setStatus("No recurring misconceptions detected for this period yet — that's a good day.");
      }
    } catch { setStatus("Couldn't load groups."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(periodId); }, [periodId, load]);

  // Ask Claude to sharpen one archetype sub-group's templated move into a
  // concrete, ready-to-run reteach. Teacher-gated (same cookie as this page);
  // the route falls back to the template on any AI failure, so this never breaks.
  const sharpen = useCallback(async (c: ClusterOut, m: Move) => {
    const key = `${c.misconception}|||${m.archetype}`;
    setSharp((s) => ({ ...s, [key]: { move: s[key]?.move || "", loading: true } }));
    try {
      const res = await fetch("/api/live/next-move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          misconception: c.misconception,
          archetype: m.archetype,
          domain: c.domain || undefined,
          students: m.students,
          corroborated: c.corroborated || undefined,
          templateMove: m.move,
        }),
      });
      const d = await res.json();
      if (d.move) setSharp((s) => ({ ...s, [key]: { move: d.move, loading: false, note: d.enriched ? undefined : "AI unavailable — showing the template." } }));
      else setSharp((s) => ({ ...s, [key]: { move: "", loading: false, note: d.error || "No move returned." } }));
    } catch {
      setSharp((s) => ({ ...s, [key]: { move: "", loading: false, note: "Couldn't reach the sharpener." } }));
    }
  }, []);

  return (
    <div className="rn-page">
      <SiteNav variant="teacher" />
      <style>{`
        .rn-page { min-height: 100vh; background: #fbf7ef; padding-bottom: 48px; }
        .rn-wrap { max-width: 1100px; margin: 0 auto; padding: 20px 24px; }
        .rn-h1 { font-family: Georgia, serif; font-size: 2rem; margin: 10px 0 4px; color: #2b2620; }
        .rn-sub { color: #7a7264; font-size: 0.95rem; margin-bottom: 18px; }
        .rn-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
        .rn-select { font: inherit; padding: 10px 14px; border-radius: 12px; border: 1px solid #e5ddcd; background: #fff; }
        .rn-btn { font: inherit; font-weight: 700; padding: 10px 16px; border-radius: 12px; border: 1px solid #e5ddcd; background: #fff; cursor: pointer; }
        .rn-status { min-height: 20px; font-size: 0.9rem; color: #7a7264; margin-bottom: 14px; }
        .rn-grid { display: grid; gap: 16px; }
        .rn-card { background: #fff; border: 1px solid #efe8d8; border-radius: 18px; padding: 20px 22px; }
        .rn-mis { font-family: Georgia, serif; font-size: 1.25rem; color: #2b2620; margin: 0; }
        .rn-badges { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0 14px; }
        .rn-badge { font-size: 0.76rem; font-weight: 800; border-radius: 999px; padding: 4px 11px; }
        .rn-badge.n { background: #eef4ff; color: #2456b8; }
        .rn-badge.c { background: #e9f7ef; color: #1e8449; }
        .rn-badge.d { background: #f5f0e3; color: #7a7264; }
        .rn-member { display: inline-flex; align-items: center; gap: 6px; background: #faf6ec; border: 1px solid #efe8d8; border-radius: 999px; padding: 5px 12px; font-weight: 700; font-size: 0.86rem; color: #4a443a; margin: 0 6px 6px 0; }
        .rn-dot { width: 9px; height: 9px; border-radius: 50%; }
        .rn-move { border-left: 4px solid #e5ddcd; padding: 10px 14px; margin: 10px 0; background: #fdfbf5; border-radius: 0 12px 12px 0; }
        .rn-move b { color: #2b2620; }
        .rn-move p { margin: 4px 0 0; color: #4a443a; line-height: 1.5; font-size: 0.95rem; }
        .rn-ns { border: 1px dashed #e0b64f; background: #fffaf0; }
        .rn-plan { border-left: 4px solid #14b8a6; background: #eefaf7; padding: 12px 14px; margin: 12px 0; border-radius: 0 12px 12px 0; }
        .rn-plan b { color: #0f5e5f; }
        .rn-plan p { margin: 4px 0 0; color: #14484a; line-height: 1.5; font-size: 0.98rem; font-weight: 600; }
        .rn-waiting { border: 1px dashed #cfe8e2; background: #f7fcfa; }
        .rn-sharpbtn { font: inherit; font-size: 0.82rem; font-weight: 700; margin-top: 8px; padding: 6px 12px; border-radius: 999px; border: 1px solid #cfe8e2; background: #fff; color: #0f5e5f; cursor: pointer; }
        .rn-sharpbtn:hover:not(:disabled) { background: #eefaf7; }
        .rn-sharpbtn:disabled { opacity: 0.6; cursor: default; }
        .rn-sharp { border-left: 4px solid #14b8a6; background: #eefaf7; padding: 10px 14px; margin: 10px 0 0; border-radius: 0 12px 12px 0; }
        .rn-sharp-tag { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.02em; color: #0f5e5f; text-transform: uppercase; }
        .rn-sharp p { margin: 4px 0 0; color: #14484a; line-height: 1.5; font-size: 0.95rem; font-weight: 600; }
        .rn-sharp-note { font-size: 0.8rem; color: #9a6a00; margin-top: 6px; }
      `}</style>

      <div className="rn-wrap">
        <h1 className="rn-h1">🌱 Growth</h1>
        <div className="rn-sub">Your immediate next steps, right now — who to pull and what to do, grouped by the misconception their work keeps showing. A tag needs 2+ hits to count, and the ✓ badge means i-Ready agrees.</div>

        <div className="rn-controls">
          <select className="rn-select" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="rn-btn" onClick={() => void load(periodId)} disabled={loading || !periodId}>↻ Refresh</button>
        </div>
        <div className="rn-status">{loading ? "Reading the room…" : status}</div>

        <div className="rn-grid">
          {clusters.map((c) => (
            <div className="rn-card" key={c.misconception}>
              <h2 className="rn-mis">“{c.misconception}”</h2>
              <div className="rn-badges">
                <span className="rn-badge n">{c.size} students</span>
                {c.domain && <span className="rn-badge d">{c.domain}</span>}
                {c.corroborated > 0 && <span className="rn-badge c">✓ i-Ready agrees for {c.corroborated} of {c.size}</span>}
              </div>
              <div>
                {c.students.map((s) => (
                  <span className="rn-member" key={s.name} title={`${ARCHETYPE_LABEL[s.archetype]} · avg ${s.avg.toFixed(1)} · tagged ×${s.occurrences}`}>
                    <span className="rn-dot" style={{ background: ARCH_COLOR[s.archetype] }} />
                    {s.name}
                  </span>
                ))}
              </div>
              {plans.has(c.misconception.toLowerCase()) && (
                <div className="rn-plan">
                  <b>📋 Your plan{lessonTitle ? ` — ${lessonTitle}` : ""}</b>
                  <p>{plans.get(c.misconception.toLowerCase())}</p>
                </div>
              )}
              {c.moves.map((m) => {
                const key = `${c.misconception}|||${m.archetype}`;
                const s = sharp[key];
                return (
                  <div className="rn-move" key={m.archetype} style={{ borderLeftColor: ARCH_COLOR[m.archetype] }}>
                    <b>{ARCHETYPE_LABEL[m.archetype]}</b> — {m.students.join(", ")}
                    <p>{m.move}</p>
                    {s?.move && (
                      <div className="rn-sharp">
                        <span className="rn-sharp-tag">✨ Sharpened for these {m.students.length} student{m.students.length === 1 ? "" : "s"}</span>
                        <p>{s.move}</p>
                      </div>
                    )}
                    {s?.note && <div className="rn-sharp-note">{s.note}</div>}
                    <button className="rn-sharpbtn" onClick={() => void sharpen(c, m)} disabled={s?.loading}>
                      {s?.loading ? "Sharpening…" : s?.move ? "↻ Re-sharpen" : "✨ Sharpen this move"}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}

          {[...plans.entries()]
            .filter(([tag]) => !clusters.some((c) => c.misconception.toLowerCase() === tag))
            .map(([tag, move]) => (
              <div className="rn-card rn-waiting" key={tag}>
                <h2 className="rn-mis">“{tag}”</h2>
                <div className="rn-badges"><span className="rn-badge d">planned{lessonTitle ? ` · ${lessonTitle}` : ""}</span><span className="rn-badge d">no students flagged yet</span></div>
                <div className="rn-plan"><b>📋 Your plan, ready to go</b><p>{move}</p></div>
              </div>
            ))}

          {nonSub.length > 0 && (
            <div className="rn-card rn-ns">
              <h2 className="rn-mis">Not submitting</h2>
              <div className="rn-badges"><span className="rn-badge n">{nonSub.length} students</span><span className="rn-badge d">logistics, not math</span></div>
              {nonSub.map((s) => (
                <div className="rn-move" key={s.name} style={{ borderLeftColor: ARCH_COLOR.nonsub }}>
                  <b>{s.name}</b> — {s.submitted}/{s.possible} submitted
                  <p>Averages {s.avgWhenSubmitting}/5 when they do submit — ability isn&apos;t the issue, follow-through is. Draft the parent contact and show them their own good work.</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
