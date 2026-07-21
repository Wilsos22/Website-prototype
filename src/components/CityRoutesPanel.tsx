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
        /* Matches the Remote's private-section card language (see .private-plan):
           tinted panel, 5px accent left border, white inner cards, uppercase
           micro-labels. Teal family so it reads as its own private section
           beside the blue small-group plan. */
        .crp { display:grid; gap:10px; border:1px solid #bcd6d4; border-left:5px solid #50a3a4; border-radius:15px; background:#f1f8f7; padding:13px; color:#28241e; font-family:var(--bdb-font); }
        .crp-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .crp-title { margin:0; color:#33706f; font-size:0.7rem; font-weight:900; letter-spacing:0.11em; text-transform:uppercase; }
        .crp-chip { font-size:0.6rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; padding:3px 9px; border-radius:999px; border:1px solid #c4cfd0; background:#fff; color:#6f675c; }
        .crp-chip.released { border-color:#9ed3b4; background:#eefaf2; color:#256d4a; }
        .crp-note { margin:0; color:#6f7c8e; font-size:0.68rem; font-weight:730; }
        .crp-cities { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
        .crp-city { border:1px solid #d5e4e2; border-radius:10px; padding:9px 11px; background:#fff; }
        .crp-city-name { margin:0; font-size:0.92rem; font-weight:900; color:#28241e; }
        .crp-city-route { margin:2px 0 0; font-size:0.6rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:#3e7d7e; }
        .crp-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .crp-btn { font:inherit; font-size:0.74rem; font-weight:850; min-height:40px; padding:0 14px; border-radius:10px; border:1px solid #c9c1b2; background:#fff; color:#28241e; cursor:pointer; }
        .crp-btn:disabled { opacity:0.45; cursor:default; }
        .crp-btn.release { border-color:#2f9e6f; color:#256d4a; }
        .crp-btn.confirm { background:#2f9e6f; border-color:#2f9e6f; color:#fff; }
        .crp-error { margin:0; font-size:0.72rem; font-weight:800; color:#b3402c; }
        .crp-empty { margin:0; font-size:0.74rem; font-weight:650; color:#6f7c8e; }
        .crp-list { display:flex; flex-direction:column; gap:5px; max-height:300px; overflow-y:auto; }
        .crp-row { display:flex; align-items:center; gap:8px; border:1px solid #dde6e5; border-radius:9px; padding:5px 8px; background:#fff; }
        .crp-row-name { flex:1 1 auto; min-width:0; font-size:0.78rem; font-weight:800; color:#28241e; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .crp-ev { flex:none; display:flex; align-items:center; gap:4px; }
        .crp-dot { width:15px; height:15px; border-radius:4px; display:grid; place-items:center; font-size:0.56rem; font-weight:900; }
        .crp-dot.yes { background:#2f9e6f; color:#fff; }
        .crp-dot.no { background:#f95335; color:#fff; }
        .crp-dot.none { background:#eceae4; color:#a59c8d; }
        .crp-fist { font-size:0.62rem; font-weight:900; color:#6f675c; min-width:24px; text-align:center; }
        .crp-flag { flex:none; font-size:0.56rem; font-weight:900; letter-spacing:0.05em; text-transform:uppercase; color:#8a6414; border:1px solid #e3c98a; background:#fdf4dd; border-radius:6px; padding:2px 6px; }
        .crp-routes { flex:none; display:flex; gap:3px; }
        .crp-route-btn { font:inherit; font-size:0.6rem; font-weight:900; min-height:32px; padding:0 9px; border-radius:7px; border:1px solid #d0cabc; background:#fff; color:#6f675c; cursor:pointer; }
        .crp-route-btn.on { background:#28241e; border-color:#28241e; color:#fff; }
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
