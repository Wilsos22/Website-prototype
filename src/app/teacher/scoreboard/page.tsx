"use client";

// The second-screen scoreboard. Open it once on the panel in the room and leave
// it there: it asks the server what game is on and follows along by itself, so
// starting a new BRUH or Grudge Ball game never means touching this screen.
//
// Read-only by design - nothing here can change a game, so it is safe to leave
// unattended on a panel students walk past.

import { useCallback, useEffect, useState } from "react";
import { teacherApiRequest } from "@/lib/teacherApi";
import type { BruhState } from "@/lib/bruhState";
import type { GrudgeState } from "@/lib/grudgeState";

const POLL_MS = 2000;

type Feed =
  | { kind: "bruh"; state: BruhState }
  | { kind: "grudge"; state: GrudgeState }
  | { kind: null };

export default function UnifiedScoreboardPage() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [stale, setStale] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setFeed(await teacherApiRequest<Feed>("/api/teacher/scoreboard"));
      setStale(false);
    } catch {
      // Keep the last good frame on a blip rather than blanking the panel. If we
      // never had one, fall through to the calm idle state - a panel left up all
      // day must never get stranded on "Loading."
      setStale(true);
      setFeed((prev) => prev ?? { kind: null });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(poll);
  }, [refresh]);

  const body = (() => {
    if (!feed) return <p className="sb-idle">Loading.</p>;

    if (feed.kind === "grudge") {
      const s = feed.state;
      const ranked = [...s.teams].sort((a, b) => b.lives - a.lives);
      return (
        <>
          <div className="sb-head">
            <h1><span className="sb-tag grudge">Grudge Ball</span></h1>
            <span className="sb-sub">{s.spent.length} of {s.game.questions.length} played</span>
          </div>
          <div className="sb-list">
            {ranked.map((t, i) => (
              <div key={t.id} className="sb-row" data-lead={i === 0 && t.lives > 0} data-dim={t.out}
                style={{ ["--tc" as string]: t.color }}>
                <span className="sb-rank">{i + 1}</span>
                <span className="sb-name">
                  {t.name}
                  {t.out && (
                    <span className="sb-flag">
                      {t.reviveReady ? "ready to revive" : `out - ${t.wins_while_out}/${s.game.revive_wins} back`}
                    </span>
                  )}
                </span>
                <span className="sb-score">{t.lives}</span>
                <span className="sb-pips">
                  {Array.from({ length: Math.max(t.lives, 0) }, (_, k) => <i key={k} />)}
                </span>
              </div>
            ))}
          </div>
        </>
      );
    }

    if (feed.kind === "bruh") {
      const s = feed.state;
      const ranked = [...s.teams].sort((a, b) => b.score - a.score);
      const top = Math.max(1, ...ranked.map((t) => Math.abs(t.score)));
      return (
        <>
          <div className="sb-head">
            <h1><span className="sb-tag bruh">BRUH</span></h1>
            <span className="sb-sub">{s.spent.length} of {s.game.questions.length} played</span>
          </div>
          <div className="sb-list">
            {ranked.map((t, i) => (
              <div key={t.id} className="sb-row" data-lead={i === 0 && t.score > 0}
                style={{ ["--tc" as string]: t.color }}>
                <span className="sb-rank">{i + 1}</span>
                <span className="sb-name">{t.name}</span>
                <span className="sb-score">{t.score}</span>
                <span className="sb-bar">
                  <i style={{ width: `${Math.max(0, (t.score / top) * 100)}%` }} />
                </span>
              </div>
            ))}
          </div>
        </>
      );
    }

    return (
      <div className="sb-waiting">
        <span className="sb-mark">Big Dog Math</span>
        <p className="sb-idle">No game running</p>
        <p className="sb-hint">This screen follows along on its own. Start a game and it appears here.</p>
      </div>
    );
  })();

  return (
    <main className="sb" data-kind={feed?.kind ?? "idle"}>
      <style>{`
        .sb { position:fixed; inset:0; font-family:var(--bdb-font); padding:34px 42px; display:flex; flex-direction:column; gap:22px; color:#eef2ea;
              background:radial-gradient(120% 90% at 50% 0%, #16202a 0%, #0b0f14 62%), #0b0f14; transition:background .6s; }
        .sb[data-kind="grudge"] { background:radial-gradient(120% 90% at 50% 0%, #121a12 0%, #0b0f0b 62%), #0b0f0b; }
        .sb[data-kind="bruh"] { background:radial-gradient(120% 90% at 50% 0%, #0e161c 0%, #0b1014 62%), #0b1014; }

        .sb-head { display:flex; align-items:baseline; justify-content:space-between; gap:18px; }
        .sb-head h1 { margin:0; }
        .sb-tag { font-size:clamp(26px,3.4vw,46px); font-weight:900; letter-spacing:-0.05em; }
        .sb-tag.bruh { color:#fcaf38; } .sb-tag.grudge { color:#f0623b; }
        .sb-sub { font-size:14px; color:#6b7a80; font-weight:600; }

        .sb-list { flex:1; display:flex; flex-direction:column; gap:10px; min-height:0; overflow-y:auto; }
        .sb-row { display:grid; grid-template-columns:64px 1fr auto; align-items:center; gap:20px;
                  padding:16px 22px; border-radius:12px; background:rgba(255,255,255,.03);
                  border:1px solid rgba(255,255,255,.07); border-left:5px solid var(--tc,#333);
                  transition:transform .5s cubic-bezier(.16,1,.3,1), background .3s; }
        .sb-row[data-dim="true"] { opacity:0.5; border-style:dashed; }
        .sb-row[data-lead="true"] { background:rgba(255,255,255,.07); }
        .sb-rank { font-size:clamp(22px,2.4vw,32px); font-weight:900; font-variant-numeric:tabular-nums; color:#6b7a80; letter-spacing:-0.04em; }
        .sb-name { font-size:clamp(20px,2.4vw,34px); font-weight:800; letter-spacing:-0.03em; display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
        .sb-flag { font-size:11px; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#6b7a80; }
        .sb-score { font-size:clamp(28px,3.4vw,48px); font-weight:900; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; color:var(--tc); }
        .sb-pips { grid-column:1 / -1; display:flex; flex-wrap:wrap; gap:5px; }
        .sb-pips i { width:16px; height:16px; border-radius:4px; background:var(--tc,#f0623b); }
        .sb-bar { grid-column:1 / -1; height:6px; border-radius:3px; background:rgba(255,255,255,.07); overflow:hidden; }
        .sb-bar i { display:block; height:100%; background:var(--tc,#fcaf38); transition:width .7s cubic-bezier(.16,1,.3,1); }

        .sb-waiting { margin:auto; display:grid; gap:10px; justify-items:center; text-align:center; }
        .sb-mark { font-size:clamp(28px,3.6vw,50px); font-weight:900; letter-spacing:-0.05em; color:#eef2ea; }
        .sb-idle { color:#6b7a80; font-size:18px; margin:0; }
        .sb-hint { color:#3d4a52; font-size:13px; margin:0; max-width:40ch; line-height:1.5; }

        @media (prefers-reduced-motion: reduce) { .sb * { transition-duration:.01ms !important; } }
      `}</style>
      {body}
      {stale && <span style={{ position: "fixed", bottom: 10, right: 14, fontSize: 10, color: "#3d4a52" }}>reconnecting</span>}
    </main>
  );
}
