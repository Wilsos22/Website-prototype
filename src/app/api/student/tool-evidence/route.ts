import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireOpenJoinedSession,
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

const TOOL_DOMAIN = {
  "equation-builder": "Algebra and Algebraic Thinking",
  gems: "Algebra and Algebraic Thinking",
  "combine-like-terms": "Algebra and Algebraic Thinking",
  "balance-beam": "Algebra and Algebraic Thinking",
  "area-model": "Algebra and Algebraic Thinking",
  "distributive-area": "Algebra and Algebraic Thinking",
  "area-explorer": "Geometry",
} as const;

type EvidenceTool = keyof typeof TOOL_DOMAIN;

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const tool = typeof body.tool === "string" && body.tool in TOOL_DOMAIN
      ? body.tool as EvidenceTool
      : null;
    const correct = body.correct === true;
    const standardId = typeof body.standardId === "string" ? body.standardId.trim().slice(0, 80) : null;
    const misconception = typeof body.misconception === "string" ? body.misconception.trim().slice(0, 160) : null;
    const problemId = typeof body.problemId === "string" && body.problemId.trim()
      ? body.problemId.trim().slice(0, 180)
      : randomUUID();
    if (!tool) throw new StudentIdentityError("This learning tool is not recognized.", 400, "invalid_tool");
    await requireOpenJoinedSession(student, sessionId);

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Learning evidence is not configured.", 503, "evidence_not_configured");
    const date = new Date().toISOString().slice(0, 10);
    const { error } = await db.from("responses").upsert(
      {
        student_id: student.id,
        session_id: sessionId,
        problem_id: null,
        source: "tool",
        domain: TOOL_DOMAIN[tool],
        standard_id: standardId,
        score: null,
        is_correct: correct,
        misconception,
        item_ref: `${tool}:${problemId}`,
        dedupe_key: `tool:${tool}:${student.id}:${date}:${problemId}`,
        graded_by: "tool",
        confirmed: false,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    );
    if (error) throw new StudentIdentityError("Your learning evidence could not be saved.", 500, "evidence_save_failed");

    return Response.json({ saved: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
