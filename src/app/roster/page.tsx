"use client";

// Teacher rosters are loaded through the protected server API.

import { useEffect, useState, useCallback } from "react";
import { teacherApiRequest, teacherPost } from "@/lib/teacherApi";
import SiteNav from "@/components/SiteNav";

interface Period { id: string; name: string; sort_order: number; }
interface Student { id: string; period_id: string; full_name: string; email: string | null; }

export default function RosterPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPeriod, setNewPeriod] = useState("");
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await teacherApiRequest<{
        periods: Period[];
        students: Array<{ id: string; periodId: string; fullName: string; email: string | null }>;
      }>("/api/teacher/roster");
      setPeriods(result.periods);
      setStudents(result.students.map((student) => ({
        id: student.id,
        period_id: student.periodId,
        full_name: student.fullName,
        email: student.email,
      })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Roster could not be loaded.");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addPeriod() {
    if (!newPeriod.trim()) return;
    try {
      await teacherPost("/api/teacher/roster", { action: "create-period", name: newPeriod.trim(), sortOrder: periods.length + 1 });
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Period could not be added."); return; }
    setNewPeriod(""); load();
  }
  async function addStudent(periodId: string) {
    const name = (nameInputs[periodId] || "").trim();
    if (!name) return;
    try {
      await teacherPost("/api/teacher/roster", { action: "create-student", periodId, fullName: name });
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Student could not be added."); return; }
    setNameInputs((m) => ({ ...m, [periodId]: "" })); load();
  }
  async function removeStudent(id: string) {
    await teacherPost("/api/teacher/roster", { action: "delete-student", studentId: id, confirm: true });
    load();
  }
  async function syncFromNotion() {
    if (syncing) return;
    setSyncing(true); setSyncMsg("Reading the Notion roster...");
    try {
      const res = await fetch("/api/roster/sync", { method: "POST" });
      const d = await res.json();
      if (d.error) setSyncMsg(`Warning: ${d.error}`);
      else {
        const extra = d.onSiteNotInNotion?.length ? `; on site but not in Notion: ${d.onSiteNotInNotion.join(", ")}` : "";
        setSyncMsg(`Synced ${d.notionRows} Notion rows: ${d.created} added, ${d.updated} updated, ${d.unchanged} unchanged${d.periodsCreated ? `, ${d.periodsCreated} new period(s)` : ""}${extra}`);
        load();
      }
    } catch { setSyncMsg("Sync failed: network error."); }
    finally { setSyncing(false); }
  }

  return (
    <main className="rs-page">
      <style>{`
        .rs-page { min-height:100vh; background:#fbf7ef; font-family:Inter,ui-sans-serif,system-ui,sans-serif; padding:0 0 50px; }
        .rs-top { display:flex; align-items:center; justify-content:space-between; padding:16px clamp(16px,4vw,40px); }
        .rs-back { color:#7a7468; font-weight:800; font-size:0.85rem; text-decoration:none; }
        .rs-mark { font-size:0.76rem; font-weight:900; letter-spacing:0.14em; text-transform:uppercase; color:#34c759; }
        .rs-wrap { max-width:680px; margin:0 auto; padding:0 16px; display:grid; gap:16px; }
        .rs-h1 { font-family:Georgia,"Times New Roman",serif; font-size:clamp(1.8rem,5vw,2.6rem); font-weight:700; color:#1c1d22; margin:6px 0 0; }
        .rs-sub { color:#7a7468; font-weight:600; margin:0 0 8px; }
        .rs-card { background:#fff; border:1px solid #efe7d6; border-radius:18px; padding:18px 20px; }
        .rs-card h2 { margin:0 0 12px; font-size:1.1rem; font-weight:900; color:#2a2a2e; }
        .rs-row { display:flex; gap:8px; flex-wrap:wrap; }
        .rs-in { flex:1; min-width:160px; border:2px solid #e7dec9; border-radius:11px; padding:10px 13px; font-size:1rem; font-weight:700; color:#2a2a2e; background:#fbf7ef; }
        .rs-btn { background:#34c759; color:#063; border:none; border-radius:11px; padding:0 18px; font-weight:900; cursor:pointer; }
        .rs-chip { display:inline-flex; align-items:center; gap:8px; background:#f6f1e6; border:1px solid #efe7d6; border-radius:999px; padding:7px 8px 7px 14px; font-weight:700; color:#4a4636; margin:4px 6px 0 0; }
        .rs-x { background:#fff; border:1px solid #efd6d2; color:#ef4444; border-radius:50%; width:22px; height:22px; cursor:pointer; font-weight:900; line-height:1; }
        .rs-students { margin-top:12px; }
        .rs-empty { color:#b3aa97; font-weight:600; font-size:0.9rem; }
        .rs-err { background:#fdecea; border:1px solid #f5c6c0; color:#b91c1c; border-radius:12px; padding:12px 16px; font-weight:700; }
        .rs-warn { background:#fff7e6; border:1px solid #ffe2a8; color:#92660a; border-radius:14px; padding:16px 18px; font-weight:700; line-height:1.6; }
      `}</style>

      <SiteNav variant="teacher" />
      <div className="rs-wrap">
        <h1 className="rs-h1">Class rosters</h1>
        <p className="rs-sub">Your periods and students, saved in Supabase.</p>

        {error && <div className="rs-err">{error}</div>}
        {loading && <p className="rs-empty">Loading...</p>}

        {!loading && (
          <>
            <div className="rs-card">
              <h2>Sync from Notion</h2>
              <p style={{ margin: "0 0 12px", color: "#7a7468", fontWeight: 600, fontSize: "0.9rem" }}>
                Pulls your Notion contact-info roster onto the site — new rows become students, periods are
                created automatically, and nothing on the site is ever deleted. Runs by itself daily too.
              </p>
              <div className="rs-row">
                <button className="rs-btn" style={{ minHeight: 42 }} onClick={syncFromNotion} disabled={syncing}>
                  {syncing ? "Syncing..." : "Sync from Notion"}
                </button>
              </div>
              {syncMsg && <p style={{ margin: "12px 0 0", fontWeight: 700, color: "#4a4636", fontSize: "0.9rem" }}>{syncMsg}</p>}
            </div>

            <div className="rs-card">
              <h2>Add a class period</h2>
              <div className="rs-row">
                <input className="rs-in" placeholder="e.g. Period 3" value={newPeriod}
                  onChange={(e) => setNewPeriod(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPeriod(); }} />
                <button className="rs-btn" onClick={addPeriod}>Add</button>
              </div>
            </div>

            {periods.length === 0 && <p className="rs-empty">No periods yet; add your first one above.</p>}

            {periods.map((p) => {
              const roster = students.filter((s) => s.period_id === p.id);
              return (
                <div className="rs-card" key={p.id}>
                  <h2>{p.name} <span style={{ color: "#b3aa97", fontWeight: 700, fontSize: "0.85rem" }}>- {roster.length} students</span></h2>
                  <div className="rs-row">
                    <input className="rs-in" placeholder="Add a student name" value={nameInputs[p.id] || ""}
                      onChange={(e) => setNameInputs((m) => ({ ...m, [p.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") addStudent(p.id); }} />
                    <button className="rs-btn" onClick={() => addStudent(p.id)}>Add</button>
                  </div>
                  <div className="rs-students">
                    {roster.length === 0 ? <span className="rs-empty">No students yet.</span>
                      : roster.map((s) => (
                        <span className="rs-chip" key={s.id}>{s.full_name}<button className="rs-x" onClick={() => removeStudent(s.id)} aria-label="Remove">×</button></span>
                      ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </main>
  );
}
