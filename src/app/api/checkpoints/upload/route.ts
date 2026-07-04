// Checkpoint CSV upload — Tier-2/Tier-1 results into the proficiency spine.
// Teacher-only (middleware). POST { csv, tier?, sbacItem? }:
//   csv      — text matching checkpoint_results_sample.csv (one row per student × item)
//   tier     — 2 (checkpoint, default: moves the bar hard) | 1 (practice-day check)
//   sbacItem — optional item # of the SBAC-modeled transfer item (feeds 'complete')
//
// Creates one checkpoint_run per (checkpoint × item), inserts per-student results
// (idempotent — re-uploading the same file doesn't duplicate), then recomputes
// mastery for every affected period so bars AND stages move immediately.
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { parseCheckpointCsv } from "@/lib/checkpointCsv";
import { recomputePeriod } from "@/lib/recompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  let body: { csv?: string; tier?: number; sbacItem?: number };
  try { body = await req.json(); } catch { return Response.json({ error: "Bad JSON." }, { status: 400 }); }
  if (!body.csv?.trim()) return Response.json({ error: "No CSV provided." }, { status: 400 });
  const tier = body.tier === 1 ? 1 : 2;
  const sbacItem = Number.isFinite(body.sbacItem) ? Number(body.sbacItem) : null;

  const { rows, errors, checkpoints } = parseCheckpointCsv(body.csv);
  if (!rows.length) return Response.json({ error: `No usable rows. ${errors.join(" ")}` }, { status: 422 });

  // Resolve students by email.
  const emails = [...new Set(rows.map((r) => r.email))];
  const { data: students, error: sErr } = await db
    .from("students").select("id,email,period_id,full_name").in("email", emails);
  if (sErr) return Response.json({ error: sErr.message }, { status: 500 });
  const byEmail = new Map((students || []).map((s) => [String(s.email).toLowerCase(), s]));
  const unmatched = emails.filter((e) => !byEmail.has(e));

  // One run per (checkpoint × item): reuse existing runs so re-uploads are idempotent.
  const { data: existingRuns } = await db
    .from("checkpoint_runs").select("id,checkpoint_id,item_index").in("checkpoint_id", checkpoints);
  const runKey = (cp: string, item: number) => `${cp}|${item}`;
  const runId = new Map<string, string>((existingRuns || []).map((r) => [runKey(r.checkpoint_id, r.item_index), r.id]));

  const wantedRuns = new Map<string, { checkpoint: string; item: number; ccss: string; lesson: string; date: string }>();
  for (const r of rows) {
    const k = runKey(r.checkpoint, r.item);
    if (!runId.has(k) && !wantedRuns.has(k)) wantedRuns.set(k, { checkpoint: r.checkpoint, item: r.item, ccss: r.ccss, lesson: r.lesson, date: r.date });
  }
  for (const [k, w] of wantedRuns) {
    const { data, error } = await db.from("checkpoint_runs").insert({
      checkpoint_id: w.checkpoint,
      item_index: w.item,
      ccss: w.ccss || null,
      prompt: `${w.checkpoint} item ${w.item}${w.lesson ? ` — ${w.lesson}` : ""}`,
      correct_answer: "(scored on upload)",
      status: "closed",
      tier,
      is_sbac: sbacItem !== null && w.item === sbacItem,
      created_at: `${w.date}T12:00:00Z`,
    }).select("id").single();
    if (error) return Response.json({ error: `Creating run ${k}: ${error.message}` }, { status: 500 });
    runId.set(k, (data as { id: string }).id);
  }

  // Existing results for these runs → skip duplicates on re-upload.
  const allRunIds = [...runId.values()];
  const { data: existingResults } = await db
    .from("checkpoint_results").select("run_id,student_id").in("run_id", allRunIds).limit(50000);
  const have = new Set((existingResults || []).map((r) => `${r.run_id}|${r.student_id}`));

  const inserts = [];
  let skippedExisting = 0;
  for (const r of rows) {
    const stu = byEmail.get(r.email);
    if (!stu) continue;
    const rid = runId.get(runKey(r.checkpoint, r.item))!;
    if (have.has(`${rid}|${stu.id}`)) { skippedExisting += 1; continue; }
    have.add(`${rid}|${stu.id}`);
    inserts.push({
      run_id: rid,
      student_id: stu.id,
      display_name: stu.full_name,
      answer: null,
      is_correct: r.correct,
      misconception: r.misconception,
      ccss: r.ccss || null,
      created_at: `${r.date}T12:00:00Z`,
    });
  }
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await db.from("checkpoint_results").insert(inserts.slice(i, i + 500));
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // Recompute every affected period so bars + stages move now.
  const periodIds = [...new Set((students || []).map((s) => s.period_id).filter(Boolean))];
  const recomputed = [];
  for (const pid of periodIds) {
    const result = await recomputePeriod(db, pid);
    recomputed.push({ periodId: pid, ok: !("error" in result) });
  }

  return Response.json({
    checkpoints,
    tier,
    itemRuns: runId.size,
    resultsInserted: inserts.length,
    skippedExisting,
    studentsMatched: emails.length - unmatched.length,
    unmatchedEmails: unmatched,
    parseWarnings: errors,
    periodsRecomputed: recomputed.length,
  });
}
