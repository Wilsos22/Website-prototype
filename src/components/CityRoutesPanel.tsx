"use client";

// City Routes review panel for the private iPad Remote. Shows the three
// rotating cities with their (private) route meanings, every student's
// readiness evidence and recommended route, and gives the teacher prepare,
// refresh, shuffle, per-student override, and release - all without a name
// ever reaching a public screen.

import { useCallback, useEffect, useRef, useState } from "react";
import { CITY_ROUTE_IDS, type CityRouteId, type CityStop } from "@/lib/cityRoutes";

interface PanelStudent {
  studentKey: string;
  name: string;
  correct: (boolean | null)[];
  fist: number | null;
  recommended: CityRouteId | null;
  needsAssignment: boolean;
  lowConfidence: boolean;
  assignedRoute: CityRouteId | null;
  assignedCity: string | null;
  source: string | null;
}

interface PanelRun {
  id: string;
  salt: number;
  cities: CityStop[];
  status: string;
  released_at: string | null;
}

interface PanelState {
  lessonCode: string;
  questionCount: number;
  hasFist: boolean;
  run: PanelRun | null;
  students: PanelStudent[];
}

const ROUTE_SHORT: Record<CityRouteId, string> = {
  teacher: "Guided",
  partner: "Partner",
  independent: "Solo",
};

const POLL_MS = 6000;

export default function CityRoutesPanel({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<PanelState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/live/city-routes?sessionId=${encodeURIComponent(sessionId)}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || `City Routes unavailable (${res.status}).`);
        return;
      }
      setState(body);
      setError(null);
    } catch {
      setError("City Routes could not reach the server.");
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [refresh]);

  const act = useCallback(
    async (action: string, extra: Record<string, string> = {}) => {
      setBusy(action);
      setError(null);
      try {
        const res = await fetch("/api/live/city-routes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, sessionId, ...extra }),
        });
        const body = await res.json();
        if (!res.ok) {
          setError(body.error || `${action} failed (${res.status}).`);
          return;
        }
        setState(body);
      } catch {
        setError(`${action} did not reach the server.`);
      } finally {
        setBusy(null);
        setConfirmingRelease(false);
      }
    },
    [sessionId],
  );

  const run = state?.run || null;
  const draft = run?.status === "draft";
  const released = run?.status === "released";
  const students = state?.students || [];
  const needing = students.filter((s) => s.needsAssignment && !s.assignedRoute);
  const flagged = students.filter((s) => s.lowConfidence);

  const routeOf = (s: PanelStudent): CityRouteId | null => s.assignedRoute || s.recommended;

  return (
    <section className="crp" aria-label="City Routes, private">
      <style>{`
        .crp { border:1px solid rgba(255,255,255,0.14); border-radius:14px; background:rgba(10,14,24,0.45); padding:14px 14px 16px; color:#eef1f8; }
        .crp-head { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:2px; }
        .crp-title { margin:0; font-size:0.95rem; font-weight:900; letter-spacing:0.02em; }
        .crp-chip { font-size:0.62rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; padding:3px 9px; border-radius:999px; border:1px solid rgba(255,255,255,0.25); color:#cfd6e6; }
        .crp-chip.released { border-color:rgba(120,220,160,0.6); color:#9fe8bf; }
        .crp-note { margin:0 0 10px; font-size:0.7rem; color:rgba(238,241,248,0.55); }
        .crp-cities { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:10px; }
        .crp-city { border:1px solid rgba(255,255,255,0.14); border-radius:10px; padding:8px 10px; background:rgba(255,255,255,0.05); }
        .crp-city-name { margin:0; font-size:0.92rem; font-weight:900; }
        .crp-city-route { margin:1px 0 0; font-size:0.64rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:rgba(238,241,248,0.6); }
        .crp-actions { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
        .crp-btn { font:inherit; font-size:0.74rem; font-weight:850; min-height:38px; padding:0 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.08); color:#eef1f8; cursor:pointer; }
        .crp-btn:disabled { opacity:0.45; cursor:default; }
        .crp-btn.release { border-color:rgba(120,220,160,0.7); color:#b9f2d2; }
        .crp-btn.confirm { background:#2f9e6f; border-color:#2f9e6f; color:#fff; }
        .crp-error { margin:0 0 8px; font-size:0.72rem; font-weight:700; color:#ffb1a6; }
        .crp-empty { margin:0; font-size:0.76rem; color:rgba(238,241,248,0.6); }
        .crp-list { display:flex; flex-direction:column; gap:5px; max-height:300px; overflow-y:auto; }
        .crp-row { display:flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,0.1); border-radius:9px; padding:5px 8px; background:rgba(255,255,255,0.03); }
        .crp-row-name { flex:1 1 auto; min-width:0; font-size:0.78rem; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .crp-ev { flex:none; display:flex; align-items:center; gap:4px; }
        .crp-dot { width:14px; height:14px; border-radius:4px; display:grid; place-items:center; font-size:0.56rem; font-weight:900; }
        .crp-dot.yes { background:rgba(47,158,111,0.85); color:#fff; }
        .crp-dot.no { background:rgba(249,83,53,0.8); color:#fff; }
        .crp-dot.none { background:rgba(255,255,255,0.14); color:rgba(255,255,255,0.5); }
        .crp-fist { font-size:0.62rem; font-weight:900; color:rgba(238,241,248,0.7); min-width:24px; text-align:center; }
        .crp-flag { flex:none; font-size:0.56rem; font-weight:900; letter-spacing:0.05em; text-transform:uppercase; color:#ffd489; border:1px solid rgba(255,212,137,0.5); border-radius:6px; padding:1px 5px; }
        .crp-routes { flex:none; display:flex; gap:3px; }
        .crp-route-btn { font:inherit; font-size:0.6rem; font-weight:900; min-height:30px; padding:0 8px; border-radius:7px; border:1px solid rgba(255,255,255,0.2); background:transparent; color:rgba(238,241,248,0.6); cursor:pointer; }
        .crp-route-btn.on { background:rgba(255,255,255,0.16); border-color:rgba(255,255,255,0.55); color:#fff; }
        .crp-route-btn.override { border-style:dashed; }
        .crp-route-btn:disabled { opacity:0.4; cursor:default; }
        @media (max-width: 700px) { .crp-cities { grid-template-columns:1fr; } }
      `}</style>

      <div className="crp-head">
        <h2 className="crp-title">City Routes</h2>
        {run ? (
          <span className={`crp-chip${released ? " released" : ""}`}>
            {released ? "Released" : `Draft, deal ${run.salt + 1}`}
          </span>
        ) : (
          <span className="crp-chip">Not prepared</span>
        )}
        {flagged.length ? <span className="crp-flag">Check in: {flagged.map((s) => s.name.split(" ")[0]).join(", ")}</span> : null}
      </div>
      <p className="crp-note">Names, evidence, and route meanings stay on this Remote. Students see one city each.</p>

      {error ? <p className="crp-error">{error}</p> : null}

      {run ? (
        <div className="crp-cities">
          {run.cities.map((stop) => (
            <article className="crp-city" key={stop.city}>
              <p className="crp-city-name">{stop.city}</p>
              <p className="crp-city-route">{stop.label}</p>
            </article>
          ))}
        </div>
      ) : null}

      <div className="crp-actions">
        {!run || released ? (
          <button className="crp-btn" type="button" disabled={busy !== null} onClick={() => act("prepare")}>
            {busy === "prepare" ? "Preparing" : released ? "New run" : "Prepare routes"}
          </button>
        ) : null}
        {draft ? (
          <>
            <button className="crp-btn" type="button" disabled={busy !== null} onClick={() => act("refresh")}>
              {busy === "refresh" ? "Refreshing" : "Refresh evidence"}
            </button>
            <button className="crp-btn" type="button" disabled={busy !== null} onClick={() => act("shuffle")}>
              {busy === "shuffle" ? "Shuffling" : "Shuffle cities"}
            </button>
            {confirmingRelease ? (
              <>
                <button className="crp-btn confirm" type="button" disabled={busy !== null} onClick={() => act("release")}>
                  {busy === "release" ? "Releasing" : "Confirm: send routes"}
                </button>
                <button className="crp-btn" type="button" onClick={() => setConfirmingRelease(false)}>Cancel</button>
              </>
            ) : (
              <button className="crp-btn release" type="button" disabled={busy !== null} onClick={() => setConfirmingRelease(true)}>
                Send routes
              </button>
            )}
          </>
        ) : null}
      </div>

      {!state ? (
        <p className="crp-empty">Loading City Routes...</p>
      ) : !state.questionCount ? (
        <p className="crp-empty">This lesson has no readiness questions, so there is nothing to route from.</p>
      ) : !students.length ? (
        <p className="crp-empty">No students have joined this session yet.</p>
      ) : (
        <div className="crp-list">
          {students.map((s) => {
            const current = routeOf(s);
            return (
              <div className="crp-row" key={s.studentKey}>
                <span className="crp-row-name">
                  {s.name}
                  {s.source === "override" ? " *" : ""}
                </span>
                <span className="crp-ev" aria-label="Readiness evidence">
                  {s.correct.map((c, i) => (
                    <span className={`crp-dot ${c === true ? "yes" : c === false ? "no" : "none"}`} key={i}>
                      {c === true ? "Y" : c === false ? "N" : "-"}
                    </span>
                  ))}
                  <span className="crp-fist">{s.fist !== null ? `F${s.fist}` : "F-"}</span>
                </span>
                {s.lowConfidence ? <span className="crp-flag">Check</span> : null}
                <span className="crp-routes">
                  {CITY_ROUTE_IDS.map((route) => (
                    <button
                      key={route}
                      type="button"
                      className={`crp-route-btn${current === route ? " on" : ""}${s.source === "override" && s.assignedRoute === route ? " override" : ""}`}
                      disabled={!run || busy !== null}
                      onClick={() => act("override", { studentKey: s.studentKey, route })}
                    >
                      {ROUTE_SHORT[route]}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
          {needing.length ? (
            <p className="crp-empty">
              Needs assignment: {needing.map((s) => s.name).join(", ")}. Tap a route to assign by hand.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
