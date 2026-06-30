"use client";

// Big Dog Math — Sequence Builder.
// Author a lesson sequence WITHOUT going into the dark Control panel: pick the
// states, set each one's minutes, name it, and save it to the shared bank
// (Supabase: lesson_presets). Launch any saved sequence and it opens Control and
// runs straight through (Start → auto-advance) until you Stop it.

import { useCallback, useEffect, useState } from "react";
import SiteNav from "@/components/SiteNav";
import { DEFAULT_STATES, BANK_GROUPS } from "@/lib/classStates";
import {
  listLessonPresets,
  saveLessonPreset,
  deleteLessonPreset,
  type LessonPreset,
} from "@/lib/lessonPresets";

const STATE_BY_ID: Record<string, (typeof DEFAULT_STATES)[number]> = Object.fromEntries(
  DEFAULT_STATES.map((s) => [s.id, s]),
);

let uidCounter = 0;
const uid = () => `b${Date.now()}_${uidCounter++}`;

interface Item {
  uid: string;
  stateId: string;
}

// Lightweight Notion tool-name matcher (self-contained so the builder doesn't
// depend on Control's larger alias table). Good enough for common tool names;
// the teacher can adjust the lineup before saving.
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
}
function matchTool(name: string): string | null {
  const n = normalize(name);
  if (!n) return null;
  const exact = DEFAULT_STATES.find((s) => normalize(s.label) === n);
  if (exact) return exact.id;
  const loose = DEFAULT_STATES.find(
    (s) => s.id.startsWith("tool-") && (normalize(s.label).includes(n) || n.includes(normalize(s.label))),
  );
  return loose ? loose.id : null;
}

export default function BuilderPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [minutes, setMinutes] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [presets, setPresets] = useState<LessonPreset[]>([]);
  const [today, setToday] = useState<{ title?: string; tools?: string | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const minFor = useCallback(
    (id: string) => minutes[id] ?? STATE_BY_ID[id]?.minutes ?? 5,
    [minutes],
  );
  const total = items.reduce((sum, it) => sum + minFor(it.stateId), 0);

  const refresh = useCallback(async () => {
    setPresets(await listLessonPresets());
  }, []);

  useEffect(() => {
    refresh();
    fetch("/api/today", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { lesson?: { title?: string; tools?: string | null } | null }) => setToday(d?.lesson ?? null))
      .catch(() => setToday(null));
  }, [refresh]);

  function flash(m: string) {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 5000);
  }

  function add(stateId: string) {
    setItems((prev) => [...prev, { uid: uid(), stateId }]);
  }
  function remove(u: string) {
    setItems((prev) => prev.filter((i) => i.uid !== u));
  }
  function move(u: string, dir: -1 | 1) {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.uid === u);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function setMin(id: string, val: number) {
    const clamped = Math.max(1, Math.min(120, Math.round(val) || 1));
    setMinutes((prev) => ({ ...prev, [id]: clamped }));
  }

  function newSequence() {
    setItems([]);
    setMinutes({});
    setTitle("");
    setCode("");
    setEditingId(undefined);
    flash("Started a new sequence.");
  }

  function loadForEdit(p: LessonPreset) {
    setItems(p.lineup.map((s) => ({ uid: uid(), stateId: s.stateId })));
    setMinutes(p.minutes || {});
    setTitle(p.title);
    setCode(p.code);
    setEditingId(p.id);
    flash(`Editing “${p.title || "untitled"}”.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildFromToday() {
    if (!today) return;
    const mapped: string[] = [];
    const unmatched: string[] = [];
    for (const name of parseList(today.tools)) {
      const id = matchTool(name);
      if (id) { if (!mapped.includes(id)) mapped.push(id); }
      else unmatched.push(name);
    }
    const ids = ["warmup", ...mapped, "exit"];
    setItems(ids.map((stateId) => ({ uid: uid(), stateId })));
    setMinutes({});
    setTitle(today.title || "Today's lesson");
    setCode("");
    setEditingId(undefined);
    flash(
      unmatched.length
        ? `Built from Notion · couldn't match: ${unmatched.join(", ")} (add them by hand).`
        : "Built today's lesson from Notion — tweak and save.",
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Collapse minutes down to only the states actually used.
  function minutesPayload(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const it of items) out[it.stateId] = minFor(it.stateId);
    return out;
  }

  async function save(launch: boolean) {
    if (items.length === 0) { flash("Add at least one state first."); return; }
    if (!title.trim()) { flash("Give the sequence a name before saving."); return; }
    setSaving(true);
    const res = await saveLessonPreset({
      id: editingId,
      code: code.trim(),
      title: title.trim(),
      lineup: items.map((it) => ({ stateId: it.stateId })),
      minutes: minutesPayload(),
    });
    setSaving(false);
    if (!res.ok || !res.id) { flash(res.error || "Couldn't save — is Supabase connected?"); return; }
    setEditingId(res.id);
    await refresh();
    if (launch) {
      window.location.href = `/control?lesson=${res.id}&run=1`;
    } else {
      flash("Saved to your sequence bank.");
    }
  }

  function launchPreset(p: LessonPreset) {
    window.location.href = `/control?lesson=${p.id}&run=1`;
  }

  async function removePreset(p: LessonPreset) {
    if (!window.confirm(`Delete “${p.title || "untitled"}” from the bank?`)) return;
    await deleteLessonPreset(p.id);
    if (editingId === p.id) newSequence();
    refresh();
  }

  return (
    <div className="bx-wrap">
      <style>{`
        .bx-wrap { min-height:100vh; background:var(--bdb-bg, #fbf7ef); color:var(--bdb-ink, #2b2722); font-family:var(--bdb-font, ui-sans-serif, system-ui); }
        .bx-main { max-width:1200px; margin:0 auto; padding:8px clamp(14px,3vw,28px) 60px; }
        .bx-hero { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; margin:14px 0 18px; }
        .bx-title { font-family:Georgia, 'Times New Roman', serif; font-size:clamp(1.7rem,3.6vw,2.5rem); font-weight:800; letter-spacing:-0.02em; margin:0; }
        .bx-sub { color:var(--bdb-ink-soft, #6f675b); margin:4px 0 0; font-size:0.96rem; max-width:60ch; }
        .bx-grid { display:grid; grid-template-columns:1.35fr 1fr; gap:20px; align-items:start; }
        @media (max-width:900px) { .bx-grid { grid-template-columns:1fr; } }
        .bx-card { background:#fff; border:1px solid #ece3d2; border-radius:18px; padding:18px clamp(14px,2.4vw,22px); box-shadow:0 1px 0 #f0e9da; }
        .bx-card h2 { font-family:Georgia, serif; font-size:1.18rem; margin:0 0 4px; }
        .bx-card .hint { color:var(--bdb-ink-soft,#6f675b); font-size:0.85rem; margin:0 0 14px; }
        .bx-fields { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
        .bx-field { display:flex; flex-direction:column; gap:5px; font-size:0.78rem; font-weight:700; color:#8b8170; }
        .bx-field.grow { flex:1 1 220px; }
        .bx-input { font:inherit; font-weight:600; color:var(--bdb-ink,#2b2722); padding:9px 12px; border:1px solid #e2d8c4; border-radius:10px; background:#fcfaf5; }
        .bx-input:focus { outline:2px solid #ffd9c2; border-color:#ff8a5c; }
        .bx-lineup { display:flex; flex-direction:column; gap:8px; margin:4px 0 16px; }
        .bx-row { display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:12px; border:1px solid #ece3d2; background:#fcfaf5; }
        .bx-dot { width:12px; height:12px; border-radius:4px; flex:none; }
        .bx-rowlabel { font-weight:700; flex:1; font-size:0.95rem; }
        .bx-min { width:58px; font:inherit; font-weight:700; text-align:center; padding:6px; border:1px solid #e2d8c4; border-radius:8px; background:#fff; }
        .bx-minlbl { font-size:0.72rem; color:#8b8170; font-weight:700; }
        .bx-ibtn { width:30px; height:30px; border-radius:8px; border:1px solid #e2d8c4; background:#fff; cursor:pointer; font-weight:800; color:#6f675b; }
        .bx-ibtn:hover { border-color:#ff8a5c; color:#ff6b3d; }
        .bx-empty { text-align:center; color:#9a9082; padding:22px; border:1.5px dashed #e2d8c4; border-radius:12px; font-size:0.9rem; }
        .bx-total { font-weight:800; font-size:0.9rem; }
        .bx-total span { color:#ff6b3d; }
        .bx-actions { display:flex; gap:9px; flex-wrap:wrap; margin-top:14px; }
        .bx-btn { font:inherit; font-weight:800; border-radius:11px; padding:11px 18px; cursor:pointer; border:1px solid #e2d8c4; background:#fff; color:var(--bdb-ink,#2b2722); }
        .bx-btn:hover { border-color:#ff8a5c; }
        .bx-btn.pri { background:#ff6b3d; border-color:#ff6b3d; color:#fff; }
        .bx-btn.go { background:#22a06b; border-color:#22a06b; color:#fff; }
        .bx-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .bx-groups { display:flex; flex-direction:column; gap:14px; }
        .bx-group h3 { font-size:0.82rem; text-transform:uppercase; letter-spacing:0.05em; color:#8b8170; margin:0 0 7px; }
        .bx-chips { display:flex; flex-wrap:wrap; gap:7px; }
        .bx-chip { display:inline-flex; align-items:center; gap:7px; padding:7px 12px; border-radius:999px; border:1px solid #ece3d2; background:#fcfaf5; cursor:pointer; font-weight:700; font-size:0.85rem; color:var(--bdb-ink,#2b2722); }
        .bx-chip:hover { border-color:#ff8a5c; background:#fff7f1; }
        .bx-msg { background:#fff3e9; border:1px solid #ffd9c2; color:#a8431b; border-radius:10px; padding:9px 13px; font-weight:700; font-size:0.88rem; margin-bottom:14px; }
        .bx-preset { display:flex; align-items:center; gap:10px; padding:11px; border:1px solid #ece3d2; border-radius:12px; background:#fcfaf5; margin-bottom:9px; }
        .bx-preset .meta { flex:1; min-width:0; }
        .bx-preset .nm { font-weight:800; font-size:0.95rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bx-preset .sub { font-size:0.78rem; color:#8b8170; }
        .bx-notion { border:1px solid #d8ecff; background:#f4faff; border-radius:14px; padding:14px; }
      `}</style>

      <SiteNav variant="teacher" />

      <div className="bx-main">
        <div className="bx-hero">
          <div>
            <h1 className="bx-title">Sequence Builder</h1>
            <p className="bx-sub">
              Build a lesson lineup here, save it to your bank, then launch it — Control opens and runs
              straight through (Start → auto-advance) until you Stop it.
            </p>
          </div>
          <a className="bx-btn" href="/control">Open Control →</a>
        </div>

        {msg && <div className="bx-msg">{msg}</div>}

        <div className="bx-grid">
          {/* ── Editor ─────────────────────────────────────────── */}
          <div className="bx-card">
            <h2>{editingId ? "Edit sequence" : "New sequence"}</h2>
            <p className="hint">Name it, add states from the bank below, set minutes, then save or launch.</p>

            <div className="bx-fields">
              <label className="bx-field grow">Name
                <input className="bx-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Triangle Area — Day 1" />
              </label>
              <label className="bx-field">Code (optional)
                <input className="bx-input" style={{ width: 120 }} value={code} onChange={(e) => setCode(e.target.value)} placeholder="M1.T2" />
              </label>
            </div>

            <div className="bx-lineup">
              {items.length === 0 ? (
                <div className="bx-empty">No states yet — tap one in the bank below to add it.</div>
              ) : (
                items.map((it, idx) => {
                  const st = STATE_BY_ID[it.stateId];
                  return (
                    <div className="bx-row" key={it.uid}>
                      <span className="bx-dot" style={{ background: st?.color || "#ccc" }} />
                      <span className="bx-rowlabel">{idx + 1}. {st?.label || it.stateId}</span>
                      <input className="bx-min" type="number" min={1} max={120} value={minFor(it.stateId)} onChange={(e) => setMin(it.stateId, Number(e.target.value))} />
                      <span className="bx-minlbl">min</span>
                      <button className="bx-ibtn" onClick={() => move(it.uid, -1)} title="Move up" disabled={idx === 0}>↑</button>
                      <button className="bx-ibtn" onClick={() => move(it.uid, 1)} title="Move down" disabled={idx === items.length - 1}>↓</button>
                      <button className="bx-ibtn" onClick={() => remove(it.uid)} title="Remove">×</button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="bx-total">Total: <span>{total} min</span>{total > 55 && " · over a 55-min period"}</div>

            <div className="bx-actions">
              <button className="bx-btn pri" onClick={() => save(false)} disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Save to bank"}</button>
              <button className="bx-btn go" onClick={() => save(true)} disabled={saving}>▶ Save &amp; Launch</button>
              <button className="bx-btn" onClick={newSequence}>New</button>
            </div>

            <div style={{ height: 18 }} />

            <h2>State bank</h2>
            <p className="hint">Tap to add to the lineup.</p>
            <div className="bx-groups">
              {BANK_GROUPS.map((g) => (
                <div className="bx-group" key={g.id}>
                  <h3>{g.label}</h3>
                  <div className="bx-chips">
                    {g.stateIds.map((id) => {
                      const st = STATE_BY_ID[id];
                      if (!st) return null;
                      return (
                        <button className="bx-chip" key={id} onClick={() => add(id)}>
                          <span className="bx-dot" style={{ background: st.color }} />
                          {st.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Directory ──────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="bx-card">
              <h2>Your sequences</h2>
              <p className="hint">{presets.length} saved · load to edit, or launch to run.</p>
              {presets.length === 0 ? (
                <div className="bx-empty">No saved sequences yet. Build one and hit “Save to bank.”</div>
              ) : (
                presets.map((p) => (
                  <div className="bx-preset" key={p.id}>
                    <div className="meta">
                      <div className="nm">{p.title || "Untitled"}</div>
                      <div className="sub">{p.code ? p.code + " · " : ""}{p.lineup.length} step{p.lineup.length === 1 ? "" : "s"}</div>
                    </div>
                    <button className="bx-ibtn" title="Load to edit" onClick={() => loadForEdit(p)}>✎</button>
                    <button className="bx-btn go" style={{ padding: "8px 12px" }} onClick={() => launchPreset(p)}>▶ Launch</button>
                    <button className="bx-ibtn" title="Delete" onClick={() => removePreset(p)}>×</button>
                  </div>
                ))
              )}
            </div>

            <div className="bx-card">
              <h2>From Notion</h2>
              <p className="hint">Today&apos;s published lesson, ready to turn into a sequence.</p>
              <div className="bx-notion">
                {today ? (
                  <>
                    <div style={{ fontWeight: 800 }}>{today.title || "Today's lesson"}</div>
                    {today.tools && <div style={{ fontSize: "0.82rem", color: "#5a6b7a", margin: "4px 0 10px" }}>Tools: {today.tools}</div>}
                    <button className="bx-btn pri" onClick={buildFromToday}>Build sequence from this →</button>
                  </>
                ) : (
                  <div style={{ color: "#5a6b7a", fontSize: "0.9rem" }}>No lesson is published in Notion for today.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
