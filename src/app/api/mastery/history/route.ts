// Teacher-only: one student's growth-over-the-year series.
// GET /api/mastery/history?studentId=…&domain=Geometry        → domain bar over time
// GET /api/mastery/history?studentId=…&standardId=6.G.A.1     → standard stage/percent over time
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId");
  const domain = url.searchParams.get("domain");
  const standardId = url.searchParams.get("standardId");
  if (!studentId || (!domain && !standardId)) {
    return Response.json({ error: "studentId and one of domain|standardId required" }, { status: 400 });
  }

  let q = db.from("mastery_history")
    .select("percent,stage,source,at,domain,standard_id")
    .eq("student_id", studentId)
    .order("at", { ascending: true })
    .limit(5000);
  if (standardId) q = q.eq("standard_id", standardId);
  else q = q.eq("domain", domain as string);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // Domain series = rows without a standard scope; filter in code rather than
  // relying on a PostgREST eq-on-empty-string.
  const rows = (data || []).filter((r) => (standardId ? true : !(r.standard_id ?? "").length));
  return Response.json({
    studentId,
    series: rows.map((r) => ({ at: r.at, percent: Number(r.percent), stage: r.stage, source: r.source })),
  });
}
