// Teacher-only (middleware basic-auth/cookie): rebuild mastery for a period from
// the raw logs. Thin wrapper around the shared engine in src/lib/recompute.ts —
// the checkpoint CSV upload calls the same code automatically.
//
// POST /api/mastery/recompute  body: { periodId }
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { recomputePeriod } from "@/lib/recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  let body: { periodId?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Bad JSON." }, { status: 400 }); }
  if (!body.periodId) return Response.json({ error: "periodId required" }, { status: 400 });

  const result = await recomputePeriod(db, body.periodId);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
