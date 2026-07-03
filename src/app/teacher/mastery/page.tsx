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

// Weekly-averaged growth chart. Raw history is one point per warm-up (jittery
// by design — EWMA wiggles); averaging by week shows the trend a teacher can read.
function bucketWeekly(points: HistoryPoint[]): { at: Date; percent: number }[] {
  const byWeek = new Map<string, { sum: number; n: number; at: Date }>();
  for (const p of points) {
    const d = new Date(p.at);
    if (Number.isNaN(d.getTime())) continue;
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const b = byWeek.get(key) || { sum: 0, n: 0, at: monday };
    b.sum += p.percent; b.n += 1;
    byWeek.set(key, b);
  }
  return [...byWeek.values()].sort((a, b) => a.at.getTime() - b.at.getTime())
    .map((b) => ({ at: b.at, percent: b.sum / b.n }));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function GrowthChart({ points, color }: { points: HistoryPoint[]; color: string }) {
  const weeks = bucketWeekly(points);
  if (weeks.length < 2) return <div style={{ color: "#9aa0a6", fontSize: 12, padding: "6px 0" }}>Not enough history yet — it charts once a couple of weeks of work is in.</div>;

  const W = 640, H = 120, L = 30, B = 16; // plot area: x in [L,W], y in [0,H-B]
  const plotH = H - B;
  const x = (i: number) => L + (i / (weeks.length - 1)) * (W - L - 4);
  const y = (pct: number) => plotH - (pct / 100) * plotH;
  const line = weeks.map((p, i) => `${x(i).toFixed(1)},${y(p.percent).toFixed(1)}`).join(" ");
  const area = `${L},${plotH} ${line} ${x(weeks.length - 1).toFixed(1)},${plotH}`;

  // month tick whenever the month changes
  const ticks: { i: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((p, i) => {
    const m = p.at.getMonth();
    if (m !== lastMonth) { ticks.push({ i, label: MONTHS[m] }); lastMonth = m; }
  });

  const first = weeks[0].percent, last = weeks[weeks.length - 1].percent;
  const delta = Math.round(last - first);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
        {[25, 50, 75].map((g) => (
          <line key={g} x1={L} x2={W - 4} y1={y(g)} y2={y(g)} stroke="#eee7d6" strokeWidth={1} />
        ))}
        <text x={L - 6} y={y(0) - 2} textAnchor="end" fontSize={10} fill="#a99f8c">0</text>
        <text x={L - 6} y={y(50) + 3} textAnchor="end" fontSize={10} fill="#a99f8c">50</text>
        <text x={L - 6} y={y(100) + 8} textAnchor="end" fontSize={10} fill="#a99f8c">100</text>
        <polygon points={area} fill={color} opacity={0.12} />
        <polyline fill="none" stroke={color} strokeWidth={2.5} points={line} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(0)} cy={y(first)} r={3.5} fill={color} />
        <circle cx={x(weeks.length - 1)} cy={y(last)} r={4.5} fill={color} stroke="#fff" strokeWidth={1.5} />
        {ticks.map((t) => (
          <text key={t.label + t.i} x={x(t.i)} y={H - 4} fontSize={10} fill="#a99f8c">{t.label}</text>
        ))}
      </svg>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4a443a", marginTop: 2 }}>
        {Math.round(first)} → {Math.round(last)}
        <span style={{ color: delta >= 0 ? "#1e8449" : "#c0392b", marginLeft: 6 }}>
          {delta >= 0 ? "▲" : "▼"} {delta >= 0 ? "+" : ""}{delta} since {MONTHS[weeks[0].at.getMonth()]}
        </span>
      </div>
    </div>
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
              const hist = series[d] || [];
              // Prefer the mastery row; fall back to the newest history point so
              // the bar always reflects the data that exists.
              const v = pct(detail, d) ?? (hist.length ? hist[hist.length - 1].percent : null);
              return (
                <div key={d} style={{ margin: "18px 0" }}>
                  <div className="mb-row">
                    <span className="mb-dlbl" style={{ width: 120 }}>{DOMAIN_SHORT[d]}</span>
                    <span className="mb-bar" style={{ height: 16 }}><span className="mb-fill" style={{ width: `${v ?? 0}%`, background: DOMAIN_COLOR[d] }} /></span>
                    <span className="mb-val" style={{ width: 40 }}>{v === null ? "—" : Math.round(v)}</span>
                  </div>
                  <GrowthChart points={hist} color={DOMAIN_COLOR[d]} />
                </div>
              );
            })}
            <div style={{ fontSize: 12, color: "#8a8172" }}>Growth over the year, averaged by week — checkpoints move the line most, warm-ups keep it honest.</div>
          </div>
        </div>
      )}
    </div>
  );
}
