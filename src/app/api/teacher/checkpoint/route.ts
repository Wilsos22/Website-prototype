import { closeCheckpoint, getCheckpointResults, launchCheckpoint, listCheckpointRuns } from "@/lib/checkpoints";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { CheckpointMiss } from "@/lib/sbacCheckpoints";

export const dynamic = "force-dynamic";

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function misses(value: unknown): CheckpointMiss[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const answer = text(record.answer, 500);
    const misconception = text(record.misconception, 160);
    return answer && misconception ? [{ answer, misconception }] : [];
  }).slice(0, 20);
}

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const runId = new URL(request.url).searchParams.get("runId") || "";
  if (runId) {
    const [{ data: run, error }, results] = await Promise.all([
      db.from("checkpoint_runs").select("*").eq("id", runId).maybeSingle(),
      getCheckpointResults(db, runId),
    ]);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!run) return Response.json({ error: "Checkpoint not found." }, { status: 404 });
    return Response.json({ run, results }, { headers: { "cache-control": "no-store" } });
  }
  const result = await listCheckpointRuns(db, 60);
  return Response.json({ runs: result.runs, missing: result.missing }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action, 20);

  if (action === "launch") {
    const prompt = text(body.prompt, 4000);
    const correctAnswer = text(body.correctAnswer, 1000);
    const checkpointId = text(body.checkpointId, 120);
    if (!prompt || !correctAnswer || !checkpointId) return Response.json({ error: "Checkpoint prompt, answer key, and ID are required." }, { status: 400 });
    const result = await launchCheckpoint(db, {
      sessionId: text(body.sessionId, 80) || null,
      periodId: text(body.periodId, 80) || null,
      lessonKey: text(body.lessonKey, 120) || null,
      checkpointId,
      itemIndex: Number.isInteger(body.itemIndex) ? Math.max(0, Number(body.itemIndex)) : 0,
      ccss: text(body.ccss, 80) || null,
      prompt,
      correctAnswer,
      misses: misses(body.misses),
    });
    if (result.error) return Response.json({ error: result.error }, { status: 500 });
    return Response.json({ run: result.run }, { status: 201 });
  }

  if (action === "close") {
    const runId = text(body.runId, 80);
    if (!runId) return Response.json({ error: "Checkpoint is required." }, { status: 400 });
    await closeCheckpoint(db, runId);
    return Response.json({ closed: true });
  }

  return Response.json({ error: "Unknown checkpoint action." }, { status: 400 });
}
