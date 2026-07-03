// Evidence ingestion — the ONE write path for warm-up Form submissions and
// manipulative-tool events. Rows land in `responses` (raw log); call
// POST /api/mastery/recompute afterwards to refresh the bars.
//
// Auth: server-to-server key (the Apps Script warm-up sync sends it). Set
// EVIDENCE_INGEST_KEY in Vercel and send it as the `x-bdm-key` header.
//
// POST body: { events: [{
//   studentId? | studentEmail?,          // one required; email → students.email
//   source: 'warmup' | 'tool',
//   domain?, standardId?, misconception?,
//   score0to5?, isCorrect?,              // warm-ups send 0–5; tools send correct/incorrect
//   itemRef?, sessionId?, at?, dedupeKey?
// }] } → { inserted, skipped, unmatched: [emails] }
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EvidenceIn {
  studentId?: string;
  studentEmail?: string;
  source?: string;
  domain?: string;
  standardId?: string;
  misconception?: string;
  score0to5?: number;
  isCorrect?: boolean;
  itemRef?: string;
  sessionId?: string;
  at?: string;
  dedupeKey?: string;
}

export async function POST(req: Request) {
  const key = process.env.EVIDENCE_INGEST_KEY;
  if (!key || req.headers.get("x-bdm-key") !== key) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  let body: { events?: EvidenceIn[] };
  try { body = await req.json(); } catch { return Response.json({ error: "Bad JSON." }, { status: 400 }); }
  const events = Array.isArray(body.events) ? body.events.slice(0, 500) : [];
  if (!events.length) return Response.json({ error: "No events." }, { status: 400 });

  // Resolve emails → student ids in one query.
  const emails = [...new Set(events.map((e) => e.studentEmail).filter(Boolean))] as string[];
  const emailToId = new Map<string, string>();
  if (emails.length) {
    const { data } = await db.from("students").select("id,email").in("email", emails);
    for (const s of data || []) if (s.email) emailToId.set(String(s.email).toLowerCase(), s.id);
  }

  const rows = [];
  const unmatched: string[] = [];
  for (const e of events) {
    const studentId = e.studentId || (e.studentEmail ? emailToId.get(e.studentEmail.toLowerCase()) : undefined);
    if (!studentId) { if (e.studentEmail) unmatched.push(e.studentEmail); continue; }
    if (e.source !== "warmup" && e.source !== "tool") continue;
    rows.push({
      student_id: studentId,
      problem_id: null,
      session_id: e.sessionId || null,
      source: e.source,
      domain: e.domain || null,
      standard_id: e.standardId || null,
      item_ref: e.itemRef || null,
      dedupe_key: e.dedupeKey || null,
      score: typeof e.score0to5 === "number" ? Math.max(0, Math.min(5, e.score0to5)) : null,
      is_correct: typeof e.isCorrect === "boolean" ? e.isCorrect : null,
      misconception: e.misconception || null,
      graded_by: "pipeline",
      submitted_at: e.at || new Date().toISOString(),
    });
  }
  if (!rows.length) return Response.json({ inserted: 0, skipped: events.length, unmatched });

  // upsert on dedupe_key where present; plain insert otherwise
  const keyed = rows.filter((r) => r.dedupe_key);
  const unkeyed = rows.filter((r) => !r.dedupe_key);
  let inserted = 0;
  if (keyed.length) {
    const { error, count } = await db.from("responses")
      .upsert(keyed, { onConflict: "dedupe_key", ignoreDuplicates: true, count: "exact" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    inserted += count ?? keyed.length;
  }
  if (unkeyed.length) {
    const { error } = await db.from("responses").insert(unkeyed);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    inserted += unkeyed.length;
  }
  return Response.json({ inserted, skipped: events.length - rows.length, unmatched });
}
