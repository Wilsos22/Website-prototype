"use client";

// Mastery board — React port of the prototype dashboard (Big Dog Math - Mock
// Data/mastery_feed_demo). Per-student EWMA bars for the four i-Ready domains,
// with a growth-sparkline drill-down per student. Data: /api/mastery (+ history),
// computed server-side by the golden-tested engine and refreshable via Recompute.

import { useCallback, useEffect, useMemo, useState } from "react";
import SiteNav from "@/components/SiteNav";
import { getSupabase } from "@/lib/supabase";
import { DOMAINS, type Domain } from "@/lib/mastery";

interface Period { id: string; name: string }
interface StudentRow { studentId: string; name: string; mastery: { domain: string; percent: number; stage: string }[] }
interface HistoryPoint { at: string; percent: number; source: string | null }

const DOMAIN_COLOR: Record<Domain, string> = {
  "Number and Operations": "#4d8df6",
  "Algebra and Algebraic Thinking": "#ff6b3d",
  "Measurement and Data": "#22c55e",
  "Geometry": "#f5b915",
};
const DOMAIN_SHORT: Record<Domain, string> = {
  "Number and Operations": "Number & Ops",
  "Algebra and Algebraic Thinking": "Algebra",
  "Measurement and Data": "Meas. & Data",
  "Geometry": "Geometry",
};

function Spark({ points, color }: { points: HistoryPoint[]; color: string }) {
  if (points.length < 2) return <div style={{ color: "#9aa0a6", fontSize: 12 }}>not enough data yet</div>;
  const w = 640, h = 44;
  const step = w / (points.length - 1);
  const pts = points.map((p, i) => `${(i * step).toFixed(1)},${(h - (p.percent / 100) * h).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 44 }}>
      <polyline fill="none" stroke={color} strokeWidth={2} points={pts} />
    </svg>
  );
}

export default function MasteryBoard() {
  const supabase = useMemo(() => getSupabase(), []);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudentRow | null>(null);
  const [series, setSeries] = useState<Record<string, HistoryPoint[]>>({});

  useEffect(() => {
    if (!supabase) return;
    supabase.from("periods").select("id,name").order("sort_order").then(({ data }) => {
      const ps = (data as Period[]) || [];
      setPeriods(ps);
      if (ps[0]) setPeriodId(ps[0].id);
    });
  }, [supabase]);

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true); setStatus(null);
    try {
      const res = await fetch(`/api/mastery?periodId=${encodeURIComponent(pid)}`, { cache: "no-store" });
      const data = await res.json();
      if (data.error) { setStatus(data.error); setRows([]); }
      else setRows(data.students || []);
    } catch { setStatus("Couldn't load mastery."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(periodId); }, [periodId, load]);

  const recompute = useCallback(async () => {
    if (!periodId || loading) return;
    setLoading(true); setStatus("Recomputing from the raw logs…");
    try {
      const res = await fetch("/api/mastery/recompute", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId }),
      });
      const data = await res.json();
      if (data.error) setStatus(data.error);
      else { setStatus(`Recomputed — ${data.students} students, ${data.domainEventsReplayed} events replayed.`); await load(periodId); }
    } catch { setStatus("Recompute failed."); }
    finally { setLoading(false); }
  }, [periodId, loading, load]);

  const openDetail = useCallback(async (stu: StudentRow) => {
    setDetail(stu); setSeries({});
    const out: Record<string, HistoryPoint[]> = {};
    await Promise.all(DOMAINS.map(async (d) => {
      try {
        const res = await fetch(`/api/mastery/history?studentId=${stu.studentId}&domain=${encodeURIComponent(d)}`, { cache: "no-store" });
        const data = await res.json();
        out[d] = data.series || [];
      } catch { out[d] = []; }
    }));
    setSeries(out);
  }, []);

  const pct = (stu: StudentRow, d: Domain) => stu.mastery.find((m) => m.domain === d)?.percent ?? null;

  return (
    <div className="mb-page">
      <SiteNav variant="teacher" />
      <style>{`
        .mb-page { min-height: 100vh; background: #fbf7ef; padding-bottom: 48px; }
        .mb-wrap { max-width: 1180px; margin: 0 auto; padding: 20px 24px; }
        .mb-h1 { font-family: Georgia, serif; font-size: 2rem; margin: 10px 0 4px; color: #2b2620; }
        .mb-sub { color: #7a7264; font-size: 0.95rem; margin-bottom: 18px; }
        .mb-controls { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
        .mb-select { font: inherit; padding: 10px 14px; border-radius: 12px; border: 1px solid #e5ddcd; background: #fff; }
        .mb-btn { font: inherit; font-weight: 700; padding: 10px 16px; border-radius: 12px; border: 1px solid #e5ddcd; background: #fff; cursor: pointer; }
        .mb-btn.pri { background: #14b8a6; border-color: #14b8a6; color: #fff; }
        .mb-status { min-height: 20px; font-size: 0.85rem; color: #7a7264; margin-bottom: 14px; }
        .mb-legend { font-size: 0.8rem; color: #7a7264; display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
        .mb-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-right: 5px; vertical-align: -1px; }
        .mb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
        .mb-card { background: #fff; border: 1px solid #efe8d8; border-radius: 16px; padding: 16px; cursor: pointer; transition: 0.12s; }
        .mb-card:hover { transform: translateY(-1px); border-color: #dcd2ba; }
        .mb-name { font-weight: 800; color: #2b2620; margin-bottom: 8px; }
        .mb-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
        .mb-dlbl { font-size: 11px; color: #8a8172; width: 92px; flex: none; }
        .mb-bar { flex: 1; height: 12px; background: #f1ecdf; border-radius: 8px; overflow: hidden; }
        .mb-fill { height: 100%; border-radius: 8px; transition: width 0.25s; }
        .mb-val { font-size: 12px; font-weight: 700; width: 34px; text-align: right; color: #4a443a; font-variant-numeric: tabular-nums; }
        .mb-empty { background: #fff; border: 1px dashed #dcd2ba; border-radius: 16px; padding: 28px; text-align: center; color: #7a7264; }
        .mb-modal { position: fixed; inset: 0; background: rgba(32,30,26,0.5); display: grid; place-items: center; padding: 20px; z-index: 50; }
        .mb-sheet { background: #fff; border-radius: 18px; max-width: 720px; width: 100%; max-height: 88vh; overflow: auto; padding: 24px; }
        .mb-close { float: right; border: none; background: #f1ecdf; border-radius: 10px; padding: 8px 12px; font-weight: 700; cursor: pointer; }
      `}</style>

      <div className="mb-wrap">
        <h1 className="mb-h1">🐾 Mastery board</h1>
        <div className="mb-sub">Recency-weighted mastery per i-Ready domain — checkpoints move the bar, practice days nudge it, warm-ups keep it honest.</div>

        <div className="mb-controls">
          <select className="mb-select" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="mb-btn pri" onClick={() => void recompute()} disabled={loading || !periodId}>↻ Recompute</button>
          <button className="mb-btn" onClick={() => void load(periodId)} disabled={loading || !periodId}>Refresh</button>
        </div>
        <div className="mb-status">{loading ? "Working…" : status}</div>

        <div className="mb-legend">
          {DOMAINS.map((d) => (
            <span key={d}><span className="mb-dot" style={{ background: DOMAIN_COLOR[d] }} />{DOMAIN_SHORT[d]}</span>
          ))}
        </div>

        {rows.length === 0 && !loading ? (
          <div className="mb-empty">
            No mastery rows yet for this period. Hit <b>↻ Recompute</b> to build them from the warm-up + checkpoint logs
            (make sure <code>supabase/proficiency.sql</code> and <code>supabase/evidence.sql</code> have been run).
          </div>
        ) : (
          <div className="mb-grid">
            {rows.map((stu) => (
              <div className="mb-card" key={stu.studentId} onClick={() => void openDetail(stu)}>
                <div className="mb-name">{stu.name}</div>
                {DOMAINS.map((d) => {
                  const v = pct(stu, d);
                  return (
                    <div className="mb-row" key={d}>
                      <span className="mb-dlbl">{DOMAIN_SHORT[d]}</span>
                      <span className="mb-bar"><span className="mb-fill" style={{ width: `${v ?? 0}%`, background: DOMAIN_COLOR[d] }} /></span>
                      <span className="mb-val">{v === null ? "—" : Math.round(v)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {detail && (
        <div className="mb-modal" onClick={() => setDetail(null)}>
          <div className="mb-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="mb-close" onClick={() => setDetail(null)}>✕ close</button>
            <h2 style={{ fontFamily: "Georgia, serif", margin: "0 0 14px", color: "#2b2620" }}>{detail.name}</h2>
            {DOMAINS.map((d) => {
              const v = pct(detail, d);
              return (
                <div key={d} style={{ margin: "14px 0" }}>
                  <div className="mb-row">
                    <span className="mb-dlbl" style={{ width: 120 }}>{DOMAIN_SHORT[d]}</span>
                    <span className="mb-bar" style={{ height: 16 }}><span className="mb-fill" style={{ width: `${v ?? 0}%`, background: DOMAIN_COLOR[d] }} /></span>
                    <span className="mb-val" style={{ width: 40 }}>{v === null ? "—" : Math.round(v)}</span>
                  </div>
                  <Spark points={series[d] || []} color={DOMAIN_COLOR[d]} />
                </div>
              );
            })}
            <div style={{ fontSize: 12, color: "#8a8172" }}>Growth over the year — every point is one piece of evidence (warm-up, practice day, or checkpoint).</div>
          </div>
        </div>
      )}
    </div>
  );
}
