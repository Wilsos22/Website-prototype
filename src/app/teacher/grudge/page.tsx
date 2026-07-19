"use client";

// Grudge Ball admin - set up the game before deploying the class to it.
// Question banks are shared with BRUH (author once, play in either game).
// Launching sends everyone to /grudge and opens the board.

import { useCallback, useEffect, useMemo, useState } from "react";
import SiteNav from "@/components/SiteNav";
import { teacherApiRequest, teacherPost } from "@/lib/teacherApi";
import { getStoredTeacherSession } from "@/lib/liveClassFlow";
import { BRUH_PRESETS } from "@/lib/bruhPresets";
import { bankToText, parseBank, teamColor } from "@/lib/bruhGame";

interface SavedSet {
  id: string;
  name: string;
  questions: { n: number; topic: string; q: string; a: string }[];
  updated_at: string;
}
interface SessionRow { id: string; join_code: string | null; status: string; period_id: string; }

const DEFAULT_TEAMS = ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5", "Team 6"];

export default function GrudgeAdminPage() {
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState("");

  const [sourceKey, setSourceKey] = useState("mixed");
  const [bankName, setBankName] = useState("Mixed Review");
  const [bankText, setBankText] = useState(() => bankToText(BRUH_PRESETS[0].questions));
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  const [teams, setTeams] = useState<string[]>(DEFAULT_TEAMS);
  const [answerSeconds, setAnswerSeconds] = useState(120);
  const [lockoutSeconds, setLockoutSeconds] = useState(20);
  const [explainSeconds, setExplainSeconds] = useState(120);
  const [shootSeconds, setShootSeconds] = useState(30);
  const [startingLives, setStartingLives] = useState(10);
  const [reviveWins, setReviveWins] = useState(2);
  const [reviveLives, setReviveLives] = useState(3);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => parseBank(bankText), [bankText]);

  const loadSets = useCallback(async () => {
    try {
      const result = await teacherApiRequest<{ sets: SavedSet[] }>("/api/teacher/grudge");
      setSets(result.sets ?? []);
    } catch {
      setNote("Saved sets could not be loaded. Has supabase/grudge.sql been run?");
    }
  }, []);

  useEffect(() => {
    void loadSets();
    void (async () => {
      try {
        const result = await teacherApiRequest<{ sessions: SessionRow[] }>("/api/teacher/session");
        const open = (result.sessions ?? []).filter((s) => s.status === "open");
        setSessions(open);
        const stored = getStoredTeacherSession();
        const preferred = stored && open.some((s) => s.id === stored.sessionId) ? stored.sessionId : open[0]?.id;
        if (preferred) setSessionId(preferred);
      } catch { /* picker stays empty */ }
    })();
  }, [loadSets]);

  const pickPreset = (key: string) => {
    const preset = BRUH_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setSourceKey(key); setEditingSetId(null);
    setBankName(preset.label); setBankText(bankToText(preset.questions));
  };
  const pickSaved = (set: SavedSet) => {
    setSourceKey(`saved:${set.id}`); setEditingSetId(set.id);
    setBankName(set.name); setBankText(bankToText(set.questions));
  };

  const saveSet = async (asNew: boolean) => {
    if (!parsed.questions.length) { setNote("Nothing to save - no questions parsed."); return; }
    if (!bankName.trim()) { setNote("Give the set a name first."); return; }
    setBusy(true);
    try {
      const result = await teacherPost<{ set: SavedSet }>("/api/teacher/grudge", {
        action: "save-set", id: asNew ? "" : editingSetId ?? "",
        name: bankName.trim(), questions: parsed.questions,
      });
      setNote(`Saved "${result.set.name}" - ${result.set.questions.length} questions.`);
      setEditingSetId(result.set.id); setSourceKey(`saved:${result.set.id}`);
      await loadSets();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The set could not be saved.");
    } finally { setBusy(false); }
  };

  const deleteSet = async (set: SavedSet) => {
    setBusy(true);
    try {
      await teacherPost("/api/teacher/grudge", { action: "delete-set", id: set.id });
      if (editingSetId === set.id) { setEditingSetId(null); setSourceKey("mixed"); }
      setNote(`Deleted "${set.name}".`);
      await loadSets();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The set could not be deleted.");
    } finally { setBusy(false); }
  };

  const launch = async () => {
    const names = teams.map((t) => t.trim()).filter(Boolean);
    if (!sessionId) { setNote("Start a class session on the Session page first."); return; }
    if (names.length < 2) { setNote("Name at least two teams."); return; }
    if (!parsed.questions.length) { setNote("No questions parsed. Check the format."); return; }
    setBusy(true);
    try {
      const state = await teacherPost<{ game: { id: string } }>("/api/teacher/grudge", {
        action: "launch", sessionId, setName: bankName.trim(), questions: parsed.questions, teams: names,
        answerSeconds, lockoutSeconds, explainSeconds, shootSeconds, startingLives, reviveWins, reviveLives,
      });
      await teacherPost("/api/teacher/session", { action: "update", sessionId, broadcast: "/grudge" });
      window.location.href = `/teacher/grudge/board?game=${encodeURIComponent(state.game.id)}`;
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The game could not be started.");
      setBusy(false);
    }
  };

  return (
    <>
      <SiteNav variant="teacher" />
      <main className="gb-admin">
        <style>{`
          .gb-admin { min-height:100vh; background:#0b0f14; color:#eef2f4; font-family:var(--bdb-font); padding:26px 30px 70px; }
          .gb-head { max-width:1120px; margin:0 auto 26px; }
          .gb-head h1 { font-size:clamp(28px,3.4vw,42px); font-weight:900; letter-spacing:-0.045em; margin:0; }
          .gb-head p { color:#8a97a1; font-size:15px; line-height:1.55; margin:9px 0 0; max-width:66ch; }
          .gb-grid { max-width:1120px; margin:0 auto; display:grid; grid-template-columns:1fr 1.15fr; gap:22px; align-items:start; }
          @media (max-width:940px){ .gb-grid{ grid-template-columns:1fr; } }
          .gb-card { background:#111820; border:1px solid #24303a; border-radius:14px; padding:20px; }
          .gb-card h2 { font-size:10px; font-weight:800; letter-spacing:0.2em; text-transform:uppercase; color:#f0623b; margin:0 0 5px; }
          .gb-hint { font-size:13px; color:#6b7883; line-height:1.5; margin:0 0 16px; }
          .gb-chips { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:14px; }
          .gb-chip { padding:7px 13px; border-radius:8px; border:1px solid #2b3742; background:#141c24; color:#8a97a1; font-size:11.5px; font-weight:800; cursor:pointer; font-family:inherit; }
          .gb-chip:hover { border-color:#f0623b; color:#eef2f4; }
          .gb-chip[data-on="true"] { background:#f0623b; border-color:#f0623b; color:#160a06; }
          .gb-chip .gb-x { margin-left:8px; opacity:0.6; }
          .gb-chip .gb-x:hover { opacity:1; color:#f95335; }
          .gb-field { display:grid; gap:6px; margin-bottom:13px; }
          .gb-field label { font-size:10px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:#6b7883; }
          .gb-admin input, .gb-admin textarea, .gb-admin select { background:#0b0f14; border:1px solid #2b3742; border-radius:7px; color:#eef2f4; font-family:inherit; font-size:14px; padding:10px 12px; width:100%; }
          .gb-admin textarea { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12.5px; line-height:1.65; min-height:300px; resize:vertical; }
          .gb-admin input:focus-visible, .gb-admin textarea:focus-visible, .gb-admin select:focus-visible { outline:3px solid #f0623b; outline-offset:2px; }
          .gb-teams { display:grid; gap:8px; }
          .gb-team { display:grid; grid-template-columns:22px 1fr 32px; align-items:center; gap:9px; }
          .gb-sw { width:22px; height:22px; border-radius:5px; }
          .gb-kill { background:transparent; border:1px solid #2b3742; border-radius:5px; color:#6b7883; font-size:15px; line-height:1; padding:6px 0; cursor:pointer; font-family:inherit; }
          .gb-kill:hover { color:#f95335; border-color:#f95335; }
          .gb-btn { padding:11px 20px; border-radius:8px; border:1px solid #2b3742; background:#141c24; color:#eef2f4; font-size:12px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; cursor:pointer; font-family:inherit; }
          .gb-btn:hover { background:#1c2731; }
          .gb-btn:disabled { opacity:0.4; cursor:not-allowed; }
          .gb-btn.primary { background:#f0623b; border-color:#f0623b; color:#160a06; }
          .gb-btn.primary:hover { background:#ff7a55; }
          .gb-btn.lg { padding:16px 34px; font-size:14px; }
          .gb-opts { display:flex; gap:14px; flex-wrap:wrap; margin-top:20px; }
          .gb-opt { display:grid; gap:6px; }
          .gb-opt label { font-size:10px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:#6b7883; }
          .gb-opt input { width:88px; }
          .gb-count { font-size:12px; color:#6b7883; margin-top:9px; }
          .gb-count b { color:#3fbf7f; } .gb-count .warn { color:#f0623b; }
          .gb-row { display:flex; gap:9px; flex-wrap:wrap; }
          .gb-foot { max-width:1120px; margin:24px auto 0; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
          .gb-note { font-size:13px; color:#f0623b; }
          .gb-links { display:flex; gap:9px; margin-left:auto; }
          .gb-links a { font-size:11px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#6b7883; text-decoration:none; border:1px solid #2b3742; border-radius:8px; padding:10px 16px; }
          .gb-links a:hover { color:#eef2f4; border-color:#6b7883; }
          .gb-kbd { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:11px; background:#141c24; border:1px solid #2b3742; border-radius:4px; padding:2px 6px; color:#8a97a1; }
        `}</style>

        <div className="gb-head">
          <h1>Grudge Ball</h1>
          <p>
            Answer to earn the hoop. The team you pick shoots for 30 seconds, then walks to the panel and
            knocks X&apos;s off whoever they want. Zero X&apos;s and you&apos;re out of the shooting - but keep
            answering, win twice, and come back with a grudge.
          </p>
        </div>

        <div className="gb-grid">
          <div>
            <div className="gb-card">
              <h2>Class session</h2>
              <p className="gb-hint">The game rides on an open session. Start one on the Session page if the list is empty.</p>
              <div className="gb-field">
                <label htmlFor="gb-session">Deploy to</label>
                <select id="gb-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                  {!sessions.length && <option value="">No open session</option>}
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.join_code ? `${s.join_code} - ` : ""}{s.id.slice(0, 8)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="gb-card" style={{ marginTop: 18 }}>
              <h2>Teams</h2>
              <p className="gb-hint">Name them now. Students pick their team when they land on the game.</p>
              <div className="gb-teams">
                {teams.map((name, i) => (
                  <div className="gb-team" key={i}>
                    <span className="gb-sw" style={{ background: teamColor(i) }} />
                    <input type="text" value={name} aria-label={`Team ${i + 1} name`}
                      onChange={(e) => setTeams((p) => p.map((t, j) => (j === i ? e.target.value : t)))} />
                    <button className="gb-kill" aria-label={`Remove ${name}`}
                      onClick={() => setTeams((p) => p.filter((_, j) => j !== i))}>&times;</button>
                  </div>
                ))}
              </div>
              <div className="gb-row" style={{ marginTop: 13 }}>
                <button className="gb-btn" onClick={() => setTeams((p) => [...p, `Team ${p.length + 1}`])}>Add team</button>
              </div>

              <div className="gb-opts">
                <div className="gb-opt"><label htmlFor="gb-lives">Starting X&apos;s</label>
                  <input id="gb-lives" type="number" min={1} max={99} value={startingLives}
                    onChange={(e) => setStartingLives(Number(e.target.value))} /></div>
                <div className="gb-opt"><label htmlFor="gb-secs">Answer window</label>
                  <input id="gb-secs" type="number" min={5} max={600} step={5} value={answerSeconds}
                    onChange={(e) => setAnswerSeconds(Number(e.target.value))} /></div>
                <div className="gb-opt"><label htmlFor="gb-lock">Lockout</label>
                  <input id="gb-lock" type="number" min={0} max={300} step={5} value={lockoutSeconds}
                    onChange={(e) => setLockoutSeconds(Number(e.target.value))} /></div>
                <div className="gb-opt"><label htmlFor="gb-explain">Explain time</label>
                  <input id="gb-explain" type="number" min={15} max={600} step={15} value={explainSeconds}
                    onChange={(e) => setExplainSeconds(Number(e.target.value))} /></div>
                <div className="gb-opt"><label htmlFor="gb-shoot">Shoot window</label>
                  <input id="gb-shoot" type="number" min={5} max={120} step={5} value={shootSeconds}
                    onChange={(e) => setShootSeconds(Number(e.target.value))} /></div>
                <div className="gb-opt"><label htmlFor="gb-rw">Wins to revive</label>
                  <input id="gb-rw" type="number" min={1} max={10} value={reviveWins}
                    onChange={(e) => setReviveWins(Number(e.target.value))} /></div>
                <div className="gb-opt"><label htmlFor="gb-rl">Come back with</label>
                  <input id="gb-rl" type="number" min={1} max={20} value={reviveLives}
                    onChange={(e) => setReviveLives(Number(e.target.value))} /></div>
              </div>
            </div>
          </div>

          <div className="gb-card">
            <h2>Question bank</h2>
            <p className="gb-hint">Shared with BRUH. One question per line: <span className="gb-kbd">number | topic | question | answer</span></p>
            <div className="gb-chips">
              {BRUH_PRESETS.map((p) => (
                <button key={p.key} className="gb-chip" data-on={sourceKey === p.key} onClick={() => pickPreset(p.key)}>{p.label}</button>
              ))}
            </div>
            {sets.length > 0 && (
              <>
                <p className="gb-hint" style={{ marginBottom: 8 }}>Your saved sets</p>
                <div className="gb-chips">
                  {sets.map((s) => (
                    <span key={s.id} className="gb-chip" data-on={sourceKey === `saved:${s.id}`}>
                      <span onClick={() => pickSaved(s)} style={{ cursor: "pointer" }}>{s.name}</span>
                      <span className="gb-x" role="button" aria-label={`Delete ${s.name}`} onClick={() => void deleteSet(s)}>&times;</span>
                    </span>
                  ))}
                </div>
              </>
            )}
            <div className="gb-field">
              <label htmlFor="gb-name">Set name</label>
              <input id="gb-name" type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <textarea value={bankText} spellCheck={false} aria-label="Question bank"
              onChange={(e) => { setBankText(e.target.value); setSourceKey("custom"); }} />
            <p className="gb-count">
              <b>{parsed.questions.length}</b> question{parsed.questions.length === 1 ? "" : "s"} ready
              {parsed.skipped > 0 && <span className="warn"> &middot; {parsed.skipped} skipped</span>}
            </p>
            <div className="gb-row" style={{ marginTop: 14 }}>
              <button className="gb-btn" disabled={busy} onClick={() => void saveSet(false)}>
                {editingSetId ? "Save changes" : "Save as set"}
              </button>
              {editingSetId && <button className="gb-btn" disabled={busy} onClick={() => void saveSet(true)}>Save as new</button>}
            </div>
          </div>
        </div>

        <div className="gb-foot">
          <button className="gb-btn primary lg" disabled={busy} onClick={() => void launch()}>
            {busy ? "Starting" : "Deploy and start"}
          </button>
          {note && <span className="gb-note">{note}</span>}
          <span className="gb-links">
            <a href="/teacher/grudge/scoreboard">Scoreboard</a>
            <a href="/teacher/grudge/remote">Remote</a>
          </span>
        </div>
      </main>
    </>
  );
}
