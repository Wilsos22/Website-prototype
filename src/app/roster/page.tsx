"use client";

// Teacher rosters are loaded through the protected server API.

import { useEffect, useState, useCallback } from "react";
import { teacherApiRequest, teacherPost } from "@/lib/teacherApi";
import SiteNav from "@/components/SiteNav";

interface Period { id: string; name: string; sort_order: number; }
interface Student { id: string; period_id: string; full_name: string; email: string | null; }
interface SiteOnlyPeriod { id: string; name: string; studentCount: number; }
interface SiteOnlyStudent { id: string; fullName: string; email: string | null; periodId: string; periodName: string; }
interface SyncResult {
  notionRows: number;
  periodsCreated: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  siteOnlyPeriods?: SiteOnlyPeriod[];
  siteOnlyStudents?: SiteOnlyStudent[];
  onSiteNotInNotion?: string[];
  reconciliationMode?: "report-only";
}

export default function RosterPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPeriod, setNewPeriod] = useState("");
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncReport, setSyncReport] = useState<{ periods: SiteOnlyPeriod[]; students: SiteOnlyStudent[] } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

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
  async function removeStudent(student: Student, periodName: string) {
    if (pendingDelete) return;
    const confirmed = window.confirm(
      `Delete ${student.full_name} from ${periodName}? This only works when the student has no saved instructional history.`,
    );
    if (!confirmed) return;
    setPendingDelete(`student:${student.id}`);
    setError(null);
    try {
      await teacherPost("/api/teacher/roster", {
        action: "delete-student",
        studentId: student.id,
        expectedName: student.full_name,
        confirm: true,
      });
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Student could not be deleted.");
    } finally {
      setPendingDelete(null);
    }
  }
  async function removePeriod(period: Period) {
    if (pendingDelete) return;
    const confirmed = window.confirm(
      `Delete class "${period.name}"? This only works when the class has no students or instructional history.`,
    );
    if (!confirmed) return;
    setPendingDelete(`period:${period.id}`);
    setError(null);
    try {
      await teacherPost("/api/teacher/roster", {
        action: "delete-period",
        periodId: period.id,
        expectedName: period.name,
        confirm: true,
      });
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Class could not be deleted.");
    } finally {
      setPendingDelete(null);
    }
  }
  async function syncFromNotion() {
    if (syncing) return;
    setSyncing(true); setSyncMsg("Reading the Notion roster...");
    setSyncReport(null);
    try {
      const d = await teacherApiRequest<SyncResult>("/api/roster/sync", { method: "POST" });
      setSyncMsg(`Synced ${d.notionRows} Notion rows: ${d.created} added, ${d.updated} updated, ${d.unchanged} unchanged${d.periodsCreated ? `, ${d.periodsCreated} new period(s)` : ""}${d.skipped ? `, ${d.skipped} skipped` : ""}.`);
      setSyncReport({ periods: d.siteOnlyPeriods ?? [], students: d.siteOnlyStudents ?? [] });
      await load();
    } catch (syncError) {
      setSyncMsg(syncError instanceof Error ? `Sync failed: ${syncError.message}` : "Sync failed: network error.");
    }
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
        .rs-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:12px; }
        .rs-card-head h2 { margin:0; }
        .rs-row { display:flex; gap:8px; flex-wrap:wrap; }
        .rs-in { flex:1; min-width:160px; border:2px solid #e7dec9; border-radius:11px; padding:10px 13px; font-size:1rem; font-weight:700; color:#2a2a2e; background:#fbf7ef; }
        .rs-btn { background:#34c759; color:#063; border:none; border-radius:11px; padding:0 18px; font-weight:900; cursor:pointer; }
        .rs-btn:disabled, .rs-delete:disabled { cursor:not-allowed; opacity:0.55; }
        .rs-chip { display:inline-flex; align-items:center; gap:8px; background:#f6f1e6; border:1px solid #efe7d6; border-radius:999px; padding:7px 8px 7px 14px; font-weight:700; color:#4a4636; margin:4px 6px 0 0; }
        .rs-delete { background:#fff; border:1px solid #e7b9b1; color:#b42318; border-radius:9px; padding:7px 10px; cursor:pointer; font-weight:900; font-size:0.78rem; line-height:1; }
        .rs-chip .rs-delete { border-radius:999px; padding:5px 9px; }
        .rs-students { margin-top:12px; }
        .rs-empty { color:#b3aa97; font-weight:600; font-size:0.9rem; }
        .rs-err { background:#fdecea; border:1px solid #f5c6c0; color:#b91c1c; border-radius:12px; padding:12px 16px; font-weight:700; }
        .rs-warn { background:#fff7e6; border:1px solid #ffe2a8; color:#92660a; border-radius:14px; padding:16px 18px; font-weight:700; line-height:1.6; }
        .rs-sync-review { margin-top:14px; border-top:1px solid #efe7d6; padding-top:14px; color:#4a4636; }
        .rs-sync-review h3 { margin:0 0 6px; font-size:0.96rem; color:#2a2a2e; }
        .rs-sync-review p { margin:0 0 8px; font-size:0.86rem; font-weight:650; line-height:1.45; }
        .rs-sync-review ul { margin:4px 0 10px; padding-left:20px; font-size:0.86rem; line-height:1.55; }
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
                created automatically. Sync never deletes site records; it reports extras for review below. Runs by itself daily too.
              </p>
              <div className="rs-row">
                <button className="rs-btn" style={{ minHeight: 42 }} onClick={syncFromNotion} disabled={syncing}>
                  {syncing ? "Syncing..." : "Sync from Notion"}
                </button>
              </div>
              {syncMsg && <p style={{ margin: "12px 0 0", fontWeight: 700, color: "#4a4636", fontSize: "0.9rem" }}>{syncMsg}</p>}
              {syncReport && (
                <div className="rs-sync-review">
                  <h3>Site-only roster review</h3>
                  <p>Report only. Sync did not delete these records.</p>
                  {syncReport.periods.length === 0 && syncReport.students.length === 0 ? (
                    <p>No site-only classes or students were found.</p>
                  ) : (
                    <>
                      {syncReport.periods.length > 0 && (
                        <div>
                          <p>Classes on the site but not in Notion:</p>
                          <ul>
                            {syncReport.periods.map((period) => (
                              <li key={period.id}>{period.name} - {period.studentCount} student{period.studentCount === 1 ? "" : "s"}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {syncReport.students.length > 0 && (
                        <div>
                          <p>Students on the site but not in Notion:</p>
                          <ul>
                            {syncReport.students.map((student) => (
                              <li key={student.id}>
                                {student.fullName} - {student.periodName}{student.email ? ` - ${student.email}` : " - no email"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
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
                  <div className="rs-card-head">
                    <h2>{p.name} <span style={{ color: "#b3aa97", fontWeight: 700, fontSize: "0.85rem" }}>- {roster.length} students</span></h2>
                    <button
                      className="rs-delete"
                      onClick={() => removePeriod(p)}
                      disabled={Boolean(pendingDelete)}
                    >
                      {pendingDelete === `period:${p.id}` ? "Deleting..." : "Delete class"}
                    </button>
                  </div>
                  <div className="rs-row">
                    <input className="rs-in" placeholder="Add a student name" value={nameInputs[p.id] || ""}
                      onChange={(e) => setNameInputs((m) => ({ ...m, [p.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") addStudent(p.id); }} />
                    <button className="rs-btn" onClick={() => addStudent(p.id)}>Add</button>
                  </div>
                  <div className="rs-students">
                    {roster.length === 0 ? <span className="rs-empty">No students yet.</span>
                      : roster.map((s) => (
                        <span className="rs-chip" key={s.id}>
                          {s.full_name}
                          <button
                            className="rs-delete"
                            onClick={() => removeStudent(s, p.name)}
                            disabled={Boolean(pendingDelete)}
                            aria-label={`Delete ${s.full_name}`}
                          >
                            {pendingDelete === `student:${s.id}` ? "Deleting..." : "Delete"}
                          </button>
                        </span>
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
