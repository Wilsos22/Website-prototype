// Teacher-only (middleware basic-auth): per-student mastery bars + stages.
// GET /api/mastery?periodId=…            → domain bars for every student in the period
// GET /api/mastery?periodId=…&standardId=6.NS.B.4 → that standard's stage rows instead
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  const url = new URL(req.url);
  const periodId = url.searchParams.get("periodId");
  const standardId = url.searchParams.get("standardId") || ""; // '' = domain-level bars
  if (!periodId) return Response.json({ error: "periodId required" }, { status: 400 });

  const { data: students, error: sErr } = await db
    .from("students").select("id,full_name").eq("period_id", periodId).order("full_name");
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 });
  const ids = (students || []).map((s) => s.id);
  if (!ids.length) return Response.json({ students: [] });

  const { data: rows, error: mErr } = await db
    .from("mastery")
    .select("student_id,domain,standard_id,percent,stage,updated_at")
    .in("student_id", ids)
    .eq("standard_id", standardId);
  if (mErr) return Response.json({ error: mErr.message }, { status: 500 });

  const byStudent = new Map<string, { domain: string; percent: number; stage: string }[]>();
  for (const r of rows || []) {
    const list = byStudent.get(r.student_id) || [];
    list.push({ domain: r.domain, percent: Number(r.percent), stage: r.stage });
    byStudent.set(r.student_id, list);
  }
  return Response.json({
    standardId: standardId || null,
    students: (students || []).map((s) => ({
      studentId: s.id,
      name: s.full_name,
      mastery: byStudent.get(s.id) || [],
    })),
  });
}
