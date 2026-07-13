import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

function boundedString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const assignmentId = boundedString(new URL(request.url).searchParams.get("assignmentId"), 80);
    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Practice assignments are not configured.", 503, "practice_not_configured");

    let query = db
      .from("practice_assignments")
      .select("id,period_id,skill,title,level,target_rounds,due_label,status,created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(80);
    if (assignmentId) query = query.eq("id", assignmentId);
    const { data, error } = await query;
    if (error) throw new StudentIdentityError("Practice assignments could not be loaded.", 500, "practice_lookup_failed");
    const assignments = (data ?? []).filter((row) => !row.period_id || row.period_id === student.periodId);

    let attemptCount = 0;
    if (assignmentId && assignments[0]) {
      const { count, error: countError } = await db
        .from("practice_assignment_attempts")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", assignmentId)
        .eq("student_id", student.id);
      if (countError) throw new StudentIdentityError("Practice progress could not be loaded.", 500, "practice_progress_failed");
      attemptCount = count ?? 0;
    }

    return Response.json(
      {
        assignments,
        assignment: assignmentId ? assignments[0] ?? null : null,
        attemptCount,
        student: { id: student.id, fullName: student.fullName },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const assignmentId = boundedString(body.assignmentId, 80);
    const prompt = boundedString(body.prompt, 1000);
    const correctAnswer = boundedString(body.correctAnswer, 500);
    const answer = boundedString(body.answer, 500);
    const timeMs = Number.isInteger(body.timeMs) ? Math.max(0, Math.min(Number(body.timeMs), 3_600_000)) : null;
    const roundIndex = Number.isInteger(body.roundIndex) ? Math.max(0, Math.min(Number(body.roundIndex), 10000)) : null;
    if (!assignmentId || !prompt || !correctAnswer) {
      throw new StudentIdentityError("A valid practice attempt is required.", 400, "invalid_practice_attempt");
    }

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Practice assignments are not configured.", 503, "practice_not_configured");
    const { data: assignment, error: assignmentError } = await db
      .from("practice_assignments")
      .select("id,period_id,skill,status")
      .eq("id", assignmentId)
      .maybeSingle();
    if (assignmentError) throw new StudentIdentityError("The practice assignment could not be checked.", 500, "practice_lookup_failed");
    if (!assignment || assignment.status !== "open") {
      throw new StudentIdentityError("This practice assignment is closed.", 409, "practice_closed");
    }
    if (assignment.period_id && assignment.period_id !== student.periodId) {
      throw new StudentIdentityError("This practice assignment belongs to another class.", 403, "wrong_period");
    }

    const isCorrect = answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    const points = isCorrect ? Math.max(10, Math.min(15, 15 - Math.floor((timeMs ?? 0) / 600))) : 0;

    const { error: saveError } = await db.from("practice_assignment_attempts").insert({
      assignment_id: assignment.id,
      student_id: student.id,
      display_name: student.fullName,
      skill: assignment.skill,
      prompt,
      correct_answer: correctAnswer,
      answer,
      is_correct: isCorrect,
      points,
      time_ms: timeMs,
      round_index: roundIndex,
    });
    if (saveError) throw new StudentIdentityError("Your practice attempt could not be saved.", 500, "practice_save_failed");

    return Response.json({ saved: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
