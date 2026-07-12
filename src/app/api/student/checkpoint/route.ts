import { gradeCheckpoint } from "@/lib/sbacCheckpoints";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireOpenJoinedSession,
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

function normalizeAnswer(value: string): string {
  return value.trim().replace(/−/g, "-").replace(/\s+/g, "").replace(/%$/, "").toLowerCase();
}

type Miss = { answer?: string; misconception?: string };

export async function GET(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
    await requireOpenJoinedSession(student, sessionId);

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Checkpoints are not configured.", 503, "checkpoints_not_configured");
    const { data, error } = await db
      .from("checkpoint_runs")
      .select("id,session_id,ccss,prompt,status,created_at,tier,is_sbac")
      .eq("session_id", sessionId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new StudentIdentityError("The checkpoint could not be loaded.", 500, "checkpoint_lookup_failed");

    return Response.json({ checkpoint: data ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as {
      runId?: unknown;
      sessionId?: unknown;
      answer?: unknown;
    };
    const runId = typeof body.runId === "string" ? body.runId : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    if (!runId || !answer || answer.length > 2000) {
      throw new StudentIdentityError("A valid checkpoint answer is required.", 400, "invalid_checkpoint_answer");
    }
    await requireOpenJoinedSession(student, sessionId);

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Checkpoints are not configured.", 503, "checkpoints_not_configured");
    const { data: run, error: runError } = await db
      .from("checkpoint_runs")
      .select("id,session_id,correct_answer,misses,ccss,status")
      .eq("id", runId)
      .maybeSingle();
    if (runError) throw new StudentIdentityError("The checkpoint could not be checked.", 500, "checkpoint_lookup_failed");
    if (!run || run.status !== "open" || run.session_id !== sessionId) {
      throw new StudentIdentityError("This checkpoint is not open for your class.", 409, "checkpoint_closed");
    }

    const isCorrect = gradeCheckpoint(answer, run.correct_answer);
    let misconception: string | null = null;
    if (!isCorrect && Array.isArray(run.misses)) {
      const match = (run.misses as Miss[]).find((miss) =>
        typeof miss.answer === "string" && normalizeAnswer(miss.answer) === normalizeAnswer(answer));
      misconception = typeof match?.misconception === "string" ? match.misconception : null;
    }

    const { error: saveError } = await db.from("checkpoint_results").upsert(
      {
        run_id: run.id,
        session_id: sessionId,
        student_id: student.id,
        display_name: student.fullName,
        answer,
        is_correct: isCorrect,
        misconception,
        ccss: run.ccss,
        notion_synced: false,
      },
      { onConflict: "run_id,student_id" },
    );
    if (saveError) throw new StudentIdentityError("Your checkpoint could not be saved.", 500, "checkpoint_save_failed");

    return Response.json({ saved: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
