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
      `}</style>

      <div className="rn-wrap">
        <h1 className="rn-h1">🎯 Right now</h1>
        <div className="rn-sub">Who to pull and what to do — grouped by the misconception their work keeps showing. A tag needs 2+ hits to count, and the ✓ badge means i-Ready agrees.</div>

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
              {c.moves.map((m) => (
                <div className="rn-move" key={m.archetype} style={{ borderLeftColor: ARCH_COLOR[m.archetype] }}>
                  <b>{ARCHETYPE_LABEL[m.archetype]}</b> — {m.students.join(", ")}
                  <p>{m.move}</p>
                </div>
              ))}
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
