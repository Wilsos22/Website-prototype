// Teacher-only (middleware): live misconception groups + next moves for a period.
// GET /api/live/groups?periodId=…
// Clusters students by recurring misconception tag (2+ occurrences), assigns the
// prototype's archetypes, attaches a templated next move per archetype, and
// corroborates each cluster against i-Ready Fall domain placement
// (multi-point confidence — flag + benchmark agree before you act).
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { buildGroups, type StudentWork } from "@/lib/grouping";
import { scaleToMastery } from "@/lib/mastery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  const url = new URL(req.url);
  const periodId = url.searchParams.get("periodId");
  if (!periodId) return Response.json({ error: "periodId required" }, { status: 400 });

  const { data: students, error: sErr } = await db
    .from("students").select("id,full_name").eq("period_id", periodId).order("full_name");
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 });
  const ids = (students || []).map((s) => s.id);
  if (!ids.length) return Response.json({ clusters: [], nonSubmitters: [], possibleDays: 0 });

  const { data: resp, error: rErr } = await db
    .from("responses")
    .select("student_id,score,is_correct,misconception,submitted_at")
    .in("student_id", ids)
    .order("submitted_at", { ascending: true })
    .limit(50000);
  if (rErr) return Response.json({ error: rErr.message }, { status: 500 });

  const byStudent = new Map<string, StudentWork>();
  const days = new Set<string>();
  for (const s of students || []) byStudent.set(s.id, { studentId: s.id, name: s.full_name, events: [] });
  for (const r of resp || []) {
    const day = String(r.submitted_at).slice(0, 10);
    days.add(day);
    const score = r.score != null ? Number(r.score) : r.is_correct === true ? 5 : r.is_correct === false ? 0 : null;
    if (score === null) continue;
    byStudent.get(r.student_id)?.events.push({ at: day, score, misconception: r.misconception || null });
  }

  const result = buildGroups([...byStudent.values()], Math.max(1, days.size));

  // Multi-point confidence: does the i-Ready Fall domain placement agree?
  const [{ data: mis }, { data: stds }, { data: ir }] = await Promise.all([
    db.from("misconceptions").select("label,standard_id"),
    db.from("standards").select("id,domain"),
    db.from("iready_scores").select("student_id,domain,scale_score").eq("window", "Fall").in("student_id", ids),
  ]);
  const stdDomain = new Map((stds || []).map((s) => [s.id, s.domain]));
  const misDomain = new Map((mis || []).map((m) => [m.label, m.standard_id ? stdDomain.get(m.standard_id) : undefined]));
  const irLow = new Map<string, Set<string>>(); // student_id → domains reading below grade
  for (const r of ir || []) {
    if (scaleToMastery(r.scale_score) < 45) {
      (irLow.get(r.student_id) || irLow.set(r.student_id, new Set()).get(r.student_id)!).add(r.domain);
    }
  }

  const clusters = result.clusters.map((c) => {
    const domain = misDomain.get(c.misconception) || null;
    const corroborated = domain
      ? c.students.filter((s) => s.studentId && irLow.get(s.studentId)?.has(domain)).length
      : 0;
    return { ...c, domain, corroborated, size: c.students.length };
  });

  return Response.json({
    possibleDays: days.size,
    clusters,
    nonSubmitters: result.nonSubmitters,
    archetypes: result.stats.map((s) => ({ name: s.name, archetype: s.archetype, avg: Math.round(s.avg * 10) / 10 })),
  });
}
