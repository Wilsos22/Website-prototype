"use client";

// BRUH admin — set up the review game before you deploy the class to it.
//
// Three things live here: the question banks (the presets ship with the app; you
// can edit any of them and save your own), the timers, and the team names.
// Launching sends everyone to /bruh and opens the board.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteNav from "@/components/SiteNav";
import { teacherApiRequest, teacherPost } from "@/lib/teacherApi";
import { getStoredTeacherSession } from "@/lib/liveClassFlow";
import { BRUH_PRESETS } from "@/lib/bruhPresets";
import { bankToText, parseBank, teamColor } from "@/lib/bruhGame";
import { BRUH_SOUND_SLOTS, BruhSound, delSound, getSound, loadSoundUrls, putSound } from "@/lib/bruhAudio";

interface SavedSet {
  id: string;
  name: string;
  questions: { n: number; topic: string; q: string; a: string }[];
  updated_at: string;
}

interface SessionRow {
  id: string;
  join_code: string | null;
  status: string;
  period_id: string;
}

const DEFAULT_TEAMS = ["Team 1", "Team 2", "Team 3", "Team 4", "Team 5", "Team 6"];

export default function BruhAdminPage() {
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

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [soundNames, setSoundNames] = useState<Record<string, string>>({});
  const soundRef = useRef<BruhSound | null>(null);

  const parsed = useMemo(() => parseBank(bankText), [bankText]);

  const loadSets = useCallback(async () => {
    try {
      const result = await teacherApiRequest<{ sets: SavedSet[] }>("/api/teacher/bruh");
      setSets(result.sets ?? []);
    } catch {
      setNote("Saved sets could not be loaded. Has supabase/bruh.sql been run?");
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
      } catch {
        /* the session picker just stays empty */
      }
    })();

    // Sounds live in IndexedDB on this machine, the same as /control's cues.
    soundRef.current = new BruhSound();
    void (async () => {
      soundRef.current?.setUrls(await loadSoundUrls());
      const names: Record<string, string> = {};
      for (const slot of BRUH_SOUND_SLOTS) {
        try { if (await getSound(slot.key)) names[slot.key] = "Loaded"; } catch { /* none */ }
      }
      setSoundNames(names);
    })();
    return () => soundRef.current?.stopAll();
  }, [loadSets]);

  const loadClip = async (key: string, file: File) => {
    try {
      await putSound(key, file);
      soundRef.current?.setUrls(await loadSoundUrls());
      setSoundNames((prev) => ({ ...prev, [key]: file.name }));
    } catch {
      setNote("That clip could not be saved on this computer.");
    }
  };

  const clearClip = async (key: string) => {
    try {
      await delSound(key);
      soundRef.current?.setUrls(await loadSoundUrls());
      setSoundNames((prev) => { const next = { ...prev }; delete next[key]; return next; });
    } catch { /* ignore */ }
  };

  const pickPreset = (key: string) => {
    const preset = BRUH_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setSourceKey(key);
    setEditingSetId(null);
    setBankName(preset.label);
    setBankText(bankToText(preset.questions));
  };

  const pickSaved = (set: SavedSet) => {
    setSourceKey(`saved:${set.id}`);
    setEditingSetId(set.id);
    setBankName(set.name);
    setBankText(bankToText(set.questions));
  };

  const saveSet = async (asNew: boolean) => {
    if (!parsed.questions.length) { setNote("Nothing to save - no questions parsed."); return; }
    if (!bankName.trim()) { setNote("Give the set a name first."); return; }
    setBusy(true);
    try {
      const result = await teacherPost<{ set: SavedSet }>("/api/teacher/bruh", {
        action: "save-set",
        id: asNew ? "" : editingSetId ?? "",
        name: bankName.trim(),
        questions: parsed.questions,
      });
      setNote(`Saved "${result.set.name}" - ${result.set.questions.length} questions.`);
      setEditingSetId(result.set.id);
      setSourceKey(`saved:${result.set.id}`);
      await loadSets();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The set could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const deleteSet = async (set: SavedSet) => {
    setBusy(true);
    try {
      await teacherPost("/api/teacher/bruh", { action: "delete-set", id: set.id });
      if (editingSetId === set.id) { setEditingSetId(null); setSourceKey("mixed"); }
      setNote(`Deleted "${set.name}".`);
      await loadSets();
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The set could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    const names = teams.map((t) => t.trim()).filter(Boolean);
    if (!sessionId) { setNote("Start a class session on the Session page first."); return; }
    if (names.length < 2) { setNote("Name at least two teams."); return; }
    if (!parsed.questions.length) { setNote("No questions parsed. Check the format."); return; }
    setBusy(true);
    try {
      const state = await teacherPost<{ game: { id: string } }>("/api/teacher/bruh", {
        action: "launch",
        sessionId,
        setName: bankName.trim(),
        questions: parsed.questions,
        teams: names,
        answerSeconds,
        lockoutSeconds,
        explainSeconds,
      });
      // Send the class to the game, then open the board.
      await teacherPost("/api/teacher/session", { action: "update", sessionId, broadcast: "/bruh" });
      window.location.href = `/teacher/bruh/board?game=${encodeURIComponent(state.game.id)}`;
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The game could not be started.");
      setBusy(false);
    }
  };

  return (
    <>
      <SiteNav variant="teacher" />
      <main className="br-admin">
        <style>{`
          .br-admin { min-height:100vh; background:#14110c; color:#efe9df; font-family:var(--bdb-font); padding:26px 30px 70px; }
          .br-head { max-width:1180px; margin:0 auto 26px; }
          .br-head h1 { font-size:clamp(28px,3.4vw,42px); font-weight:900; letter-spacing:-0.045em; margin:0; }
          .br-head p { color:#a39a88; font-size:15px; line-height:1.55; margin:9px 0 0; max-width:64ch; }

          .br-grid { max-width:1180px; margin:0 auto; display:grid; grid-template-columns:1fr 1.15fr; gap:22px; align-items:start; }
          @media (max-width:940px) { .br-grid { grid-template-columns:1fr; } }

          .br-card { background:#18140d; border:1px solid #2a241a; border-radius:14px; padding:20px; }
          .br-card h2 { font-size:10px; font-weight:800; letter-spacing:0.2em; text-transform:uppercase; color:#fcaf38; margin:0 0 5px; }
          .br-hint { font-size:13px; color:#7c7363; line-height:1.5; margin:0 0 16px; }

          .br-chips { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:14px; }
          .br-chip { padding:7px 13px; border-radius:8px; border:1px solid #34301f; background:#1a160f; color:#a39a88; font-size:11.5px; font-weight:800; cursor:pointer; font-family:inherit; }
          .br-chip:hover { border-color:#fcaf38; color:#efe9df; }
          .br-chip[data-on="true"] { background:#fcaf38; border-color:#fcaf38; color:#1a1206; }
          .br-chip .br-x { margin-left:8px; opacity:0.6; }
          .br-chip .br-x:hover { opacity:1; color:#f95335; }

          .br-field { display:grid; gap:6px; margin-bottom:13px; }
          .br-field label { font-size:10px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:#7c7363; }
          .br-admin input, .br-admin textarea, .br-admin select { background:#14110c; border:1px solid #34301f; border-radius:7px; color:#efe9df; font-family:inherit; font-size:14px; padding:10px 12px; width:100%; }
          .br-admin textarea { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12.5px; line-height:1.65; min-height:300px; resize:vertical; }
          .br-admin input:focus-visible, .br-admin textarea:focus-visible, .br-admin select:focus-visible { outline:3px solid #fcaf38; outline-offset:2px; }

          .br-row { display:flex; gap:9px; flex-wrap:wrap; }
          .br-btn { padding:11px 20px; border-radius:8px; border:1px solid #34301f; background:#1a160f; color:#efe9df; font-size:12px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; cursor:pointer; font-family:inherit; }
          .br-btn:hover { background:#22201a; }
          .br-btn:disabled { opacity:0.4; cursor:not-allowed; }
          .br-btn.primary { background:#fcaf38; border-color:#fcaf38; color:#1a1206; }
          .br-btn.primary:hover { background:#ffc257; }
          .br-btn.lg { padding:16px 34px; font-size:14px; }

          .br-teams { display:grid; gap:8px; }
          .br-team { display:grid; grid-template-columns:22px 1fr 32px; align-items:center; gap:9px; }
          .br-sw { width:22px; height:22px; border-radius:5px; }
          .br-kill { background:transparent; border:1px solid #34301f; border-radius:5px; color:#7c7363; font-size:15px; line-height:1; padding:6px 0; cursor:pointer; font-family:inherit; }
          .br-kill:hover { color:#f95335; border-color:#f95335; }

          .br-opts { display:flex; gap:16px; flex-wrap:wrap; margin-top:20px; }
          .br-opt { display:grid; gap:6px; }
          .br-opt label { font-size:10px; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:#7c7363; }
          .br-opt input { width:92px; }

          .br-count { font-size:12px; color:#7c7363; margin-top:9px; }
          .br-count b { color:#2f9e6f; }
          .br-count .warn { color:#fcaf38; }

          .br-foot { max-width:1180px; margin:24px auto 0; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
          .br-note { font-size:13px; color:#fcaf38; }
          .br-links { display:flex; gap:9px; margin-left:auto; }
          .br-links a { font-size:11px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:#7c7363; text-decoration:none; border:1px solid #34301f; border-radius:8px; padding:10px 16px; }
          .br-links a:hover { color:#efe9df; border-color:#7c7363; }
          .br-kbd { font-family:ui-monospace,Menlo,Consolas,monospace; font-size:11px; background:#1a160f; border:1px solid #34301f; border-radius:4px; padding:2px 6px; color:#a39a88; }

          .br-sounds { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:10px; }
          .br-sound { display:grid; grid-template-columns:1fr auto auto auto; align-items:center; gap:8px; padding:11px 13px; border-radius:8px; background:#1a160f; border:1px solid #34301f; }
          .br-sound[data-loaded="true"] { border-color:#2f9e6f; }
          .br-sinfo { display:grid; gap:2px; min-width:0; }
          .br-sinfo b { font-size:12.5px; font-weight:800; }
          .br-sinfo i { font-size:11px; color:#7c7363; font-style:normal; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .br-sound[data-loaded="true"] .br-sinfo i { color:#2f9e6f; }
          .br-sound .br-btn { padding:7px 12px; font-size:10px; }
          .br-file { cursor:pointer; display:inline-block; }
        `}</style>

        <div className="br-head">
          <h1>BRUH</h1>
          <p>
            Pick a question bank, name the teams, and deploy. Students answer on their laptops and the board
            shows who is in, who is locked out, and who is right, so you can put the receiver down.
          </p>
        </div>

        <div className="br-grid">
          <div>
            <div className="br-card">
              <h2>Class session</h2>
              <p className="br-hint">
                The game rides on an open session. Start one on the Session page if the list is empty.
              </p>
              <div className="br-field">
                <label htmlFor="br-session">Deploy to</label>
                <select id="br-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                  {!sessions.length && <option value="">No open session</option>}
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.join_code ? `${s.join_code} - ` : ""}{s.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="br-card" style={{ marginTop: 18 }}>
              <h2>Teams</h2>
              <p className="br-hint">Name them now. Students pick their team when they land on the game.</p>
              <div className="br-teams">
                {teams.map((name, i) => (
                  <div className="br-team" key={i}>
                    <span className="br-sw" style={{ background: teamColor(i) }} />
                    <input
                      type="text"
                      value={name}
                      aria-label={`Team ${i + 1} name`}
                      onChange={(e) => setTeams((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))}
                    />
                    <button
                      className="br-kill"
                      aria-label={`Remove ${name}`}
                      onClick={() => setTeams((prev) => prev.filter((_, j) => j !== i))}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              <div className="br-row" style={{ marginTop: 13 }}>
                <button className="br-btn" onClick={() => setTeams((prev) => [...prev, `Team ${prev.length + 1}`])}>
                  Add team
                </button>
              </div>

              <div className="br-opts">
                <div className="br-opt">
                  <label htmlFor="br-secs">Answer window</label>
                  <input id="br-secs" type="number" min={5} max={600} step={5} value={answerSeconds}
                    onChange={(e) => setAnswerSeconds(Number(e.target.value))} />
                </div>
                <div className="br-opt">
                  <label htmlFor="br-lock">Wrong-answer lockout</label>
                  <input id="br-lock" type="number" min={0} max={300} step={5} value={lockoutSeconds}
                    onChange={(e) => setLockoutSeconds(Number(e.target.value))} />
                </div>
                <div className="br-opt">
                  <label htmlFor="br-explain">Explanation time</label>
                  <input id="br-explain" type="number" min={15} max={600} step={15} value={explainSeconds}
                    onChange={(e) => setExplainSeconds(Number(e.target.value))} />
                </div>
              </div>
            </div>
          </div>

          <div className="br-card">
            <h2>Question bank</h2>
            <p className="br-hint">
              One question per line: <span className="br-kbd">number | topic | question | answer</span>
            </p>

            <div className="br-chips">
              {BRUH_PRESETS.map((p) => (
                <button key={p.key} className="br-chip" data-on={sourceKey === p.key} onClick={() => pickPreset(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
            {sets.length > 0 && (
              <>
                <p className="br-hint" style={{ marginBottom: 8 }}>Your saved sets</p>
                <div className="br-chips">
                  {sets.map((s) => (
                    <span key={s.id} className="br-chip" data-on={sourceKey === `saved:${s.id}`}>
                      <span onClick={() => pickSaved(s)} style={{ cursor: "pointer" }}>{s.name}</span>
                      <span className="br-x" role="button" aria-label={`Delete ${s.name}`} onClick={() => void deleteSet(s)}>&times;</span>
                    </span>
                  ))}
                </div>
              </>
            )}

            <div className="br-field">
              <label htmlFor="br-name">Set name</label>
              <input id="br-name" type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>

            <textarea
              value={bankText}
              spellCheck={false}
              aria-label="Question bank"
              onChange={(e) => { setBankText(e.target.value); setSourceKey("custom"); }}
            />
            <p className="br-count">
              <b>{parsed.questions.length}</b> question{parsed.questions.length === 1 ? "" : "s"} ready
              {parsed.skipped > 0 && <span className="warn"> &middot; {parsed.skipped} line{parsed.skipped === 1 ? "" : "s"} skipped</span>}
            </p>

            <div className="br-row" style={{ marginTop: 14 }}>
              <button className="br-btn" disabled={busy} onClick={() => void saveSet(false)}>
                {editingSetId ? "Save changes" : "Save as set"}
              </button>
              {editingSetId && (
                <button className="br-btn" disabled={busy} onClick={() => void saveSet(true)}>Save as new</button>
              )}
            </div>
          </div>
        </div>

        <div className="br-grid" style={{ marginTop: 18 }}>
          <div className="br-card" style={{ gridColumn: "1 / -1" }}>
            <h2>Sound</h2>
            <p className="br-hint">
              Load clips from this computer for each moment; they stay on this machine and the board fires
              them. Empty slots fall back to a built-in tone, so the game is never silent.
            </p>
            <div className="br-sounds">
              {BRUH_SOUND_SLOTS.map((slot) => (
                <div className="br-sound" key={slot.key} data-loaded={!!soundNames[slot.key]}>
                  <div className="br-sinfo">
                    <b>{slot.label}</b>
                    <i>{soundNames[slot.key] ?? slot.hint}</i>
                  </div>
                  <label className="br-btn br-file">
                    {soundNames[slot.key] ? "Replace" : "Choose"}
                    <input type="file" accept="audio/*" hidden
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadClip(slot.key, f); }} />
                  </label>
                  <button className="br-btn" disabled={!soundNames[slot.key]}
                    onClick={() => soundRef.current?.play(slot.key)}>Play</button>
                  {soundNames[slot.key] && (
                    <button className="br-kill" aria-label={`Remove ${slot.label}`} onClick={() => void clearClip(slot.key)}>&times;</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="br-foot">
          <button className="br-btn primary lg" disabled={busy} onClick={() => void launch()}>
            {busy ? "Starting" : "Deploy and start"}
          </button>
          {note && <span className="br-note">{note}</span>}
          <span className="br-links">
            <a href="/teacher/scoreboard">Scoreboard</a>
            <a href="/teacher/bruh/remote">Remote</a>
          </span>
        </div>
      </main>
    </>
  );
}
