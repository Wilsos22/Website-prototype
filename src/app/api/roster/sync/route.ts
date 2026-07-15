// Roster sync: Notion "All Contact Information" DB → Supabase periods/students.
// Add a row in Notion and it appears on the site — run via the Rosters page
// button, or automatically by the daily Vercel cron (vercel.json).
//
// Rules: email is the match key (site-unique); period is created if missing;
// name/period updates follow Notion; rows without an email match by name+period.
// NEVER deletes site students — students missing from Notion are only reported,
// so evidence history and the mock fixtures can't be wiped by a roster change.
//
// Auth: teacher basic-auth via middleware; the cron bypasses with CRON_SECRET.
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { fetchNotionRoster } from "@/lib/notionRoster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

type SiteStudent = {
  id: string;
  period_id: string;
  full_name: string;
  email: string | null;
};

async function sync() {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  let roster;
  try { roster = await fetchNotionRoster(); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Notion read failed." }, { status: 502 }); }
  if (!roster.length) return Response.json({ error: "Notion roster returned 0 rows — not syncing." }, { status: 422 });

  const [{ data: pData, error: pErr }, { data: sData, error: sErr }] = await Promise.all([
    db.from("periods").select("id,name,sort_order"),
    db.from("students").select("id,period_id,full_name,email"),
  ]);
  if (pErr || sErr) return Response.json({ error: (pErr || sErr)!.message }, { status: 500 });

  const periods = new Map<string, string>((pData || []).map((p) => [normalized(p.name), p.id]));
  const periodNames = new Map<string, string>((pData || []).map((p) => [p.id, p.name]));
  const maxSort = Math.max(0, ...((pData || []).map((p) => p.sort_order || 0)));

  // Create any periods Notion mentions that the site doesn't have yet.
  const wanted = [...new Set(roster.map((r) => r.period.trim()))];
  let periodsCreated = 0;
  for (const name of wanted) {
    if (periods.has(normalized(name))) continue;
    const numeric = name.match(/\d+/)?.[0];
    const { data, error } = await db.from("periods")
      .insert({ name, sort_order: numeric ? Number(numeric) : maxSort + 10 + periodsCreated })
      .select("id").single();
    if (error) return Response.json({ error: `Creating period "${name}": ${error.message}` }, { status: 500 });
    periods.set(normalized(name), (data as { id: string }).id);
    periodsCreated += 1;
  }

  const originalSiteStudents = (sData || []) as SiteStudent[];
  const siteStudents = [...originalSiteStudents];
  const byEmail = new Map<string, SiteStudent>();
  const byNamePeriod = new Map<string, SiteStudent[]>();
  const matchedSiteStudentIds = new Set<string>();

  const namePeriodKey = (name: string, periodId: string) => `${normalized(name)}|${periodId}`;
  const addToNamePeriodIndex = (student: SiteStudent) => {
    const key = namePeriodKey(student.full_name, student.period_id);
    byNamePeriod.set(key, [...(byNamePeriod.get(key) || []), student]);
  };
  const replaceStudentIndex = (student: SiteStudent, next: SiteStudent) => {
    const oldKey = namePeriodKey(student.full_name, student.period_id);
    const remaining = (byNamePeriod.get(oldKey) || []).filter((candidate) => candidate.id !== student.id);
    if (remaining.length) byNamePeriod.set(oldKey, remaining);
    else byNamePeriod.delete(oldKey);
    Object.assign(student, next);
    addToNamePeriodIndex(student);
    if (student.email) byEmail.set(normalized(student.email), student);
  };
  const registerStudent = (student: SiteStudent) => {
    siteStudents.push(student);
    addToNamePeriodIndex(student);
    if (student.email) byEmail.set(normalized(student.email), student);
    matchedSiteStudentIds.add(student.id);
  };

  for (const student of siteStudents) {
    if (student.email) byEmail.set(normalized(student.email), student);
    addToNamePeriodIndex(student);
  }

  let created = 0, updated = 0, unchanged = 0, skipped = 0;
  for (const r of roster) {
    const periodId = periods.get(normalized(r.period))!;
    if (r.email) {
      const existing = byEmail.get(normalized(r.email));
      if (existing) {
        if (existing.full_name !== r.name || existing.period_id !== periodId) {
          const { error } = await db.from("students").update({ full_name: r.name, period_id: periodId }).eq("id", existing.id);
          if (error) { skipped += 1; continue; }
          replaceStudentIndex(existing, { ...existing, full_name: r.name, period_id: periodId });
          updated += 1;
        } else unchanged += 1;
        matchedSiteStudentIds.add(existing.id);
      } else {
        const candidates = (byNamePeriod.get(namePeriodKey(r.name, periodId)) || [])
          .filter((student) => !student.email && !matchedSiteStudentIds.has(student.id));
        if (candidates.length > 1) {
          skipped += 1;
          continue;
        }
        if (candidates.length === 1) {
          const candidate = candidates[0];
          const next = { ...candidate, full_name: r.name, period_id: periodId, email: r.email };
          const { error } = await db.from("students")
            .update({ full_name: r.name, period_id: periodId, email: r.email })
            .eq("id", candidate.id);
          if (error) { skipped += 1; continue; }
          replaceStudentIndex(candidate, next);
          matchedSiteStudentIds.add(candidate.id);
          updated += 1;
          continue;
        }
        const { data, error } = await db.from("students")
          .insert({ period_id: periodId, full_name: r.name, email: r.email })
          .select("id,period_id,full_name,email")
          .single();
        if (error) { skipped += 1; continue; }
        registerStudent(data as SiteStudent);
        created += 1;
      }
    } else {
      // Without an email, use one unmatched exact name-and-period row. Multiple
      // candidates are ambiguous and remain visible in the reconciliation report.
      const candidates = (byNamePeriod.get(namePeriodKey(r.name, periodId)) || [])
        .filter((student) => !matchedSiteStudentIds.has(student.id));
      if (candidates.length === 1) {
        matchedSiteStudentIds.add(candidates[0].id);
        unchanged += 1;
        continue;
      }
      if (candidates.length > 1) {
        skipped += 1;
        continue;
      }
      const { data, error } = await db.from("students")
        .insert({ period_id: periodId, full_name: r.name })
        .select("id,period_id,full_name,email")
        .single();
      if (error) { skipped += 1; continue; }
      registerStudent(data as SiteStudent);
      created += 1;
    }
  }

  // Report-only reconciliation preview. Nothing in these lists is deleted.
  const notionPeriods = new Set(roster.map((row) => normalized(row.period)));
  const siteOnlyStudents = originalSiteStudents
    .filter((student) => !student.email || !String(student.email).includes("@mock.bigdogmath.example"))
    .filter((student) => !matchedSiteStudentIds.has(student.id))
    .map((student) => ({
      id: student.id,
      fullName: student.full_name,
      email: student.email,
      periodId: student.period_id,
      periodName: periodNames.get(student.period_id) || "Unknown class",
    }));
  const siteOnlyPeriods = (pData || [])
    .filter((period) => !notionPeriods.has(normalized(period.name)))
    .map((period) => ({
      id: period.id,
      name: period.name,
      studentCount: (sData || []).filter((student) => student.period_id === period.id).length,
    }));
  const onSiteNotInNotion = siteOnlyStudents.map((student) => student.fullName);

  return Response.json({
    notionRows: roster.length, periodsCreated, created, updated, unchanged, skipped,
    onSiteNotInNotion,
    siteOnlyPeriods,
    siteOnlyStudents,
    reconciliationMode: "report-only",
  });
}

export async function POST() { return sync(); }
export async function GET() { return sync(); } // Vercel cron invokes with GET
