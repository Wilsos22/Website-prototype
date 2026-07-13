import { getAssignmentResults } from "@/lib/assignments";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const url = new URL(request.url);
  const assignmentId = url.searchParams.get("assignmentId") || "";
  if (assignmentId) {
    const { data: assignment, error } = await db.from("practice_assignments").select("*").eq("id", assignmentId).maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!assignment) return Response.json({ error: "Assignment not found." }, { status: 404 });
    const results = await getAssignmentResults(db, assignmentId, assignment.target_rounds);
    return Response.json({ assignment, results }, { headers: { "cache-control": "no-store" } });
  }

  const { data, error } = await db.from("practice_assignments").select("*").order("created_at", { ascending: false }).limit(80);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ assignments: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action, 20);

  if (action === "create") {
    const periodId = text(body.periodId, 80) || null;
    const skill = text(body.skill, 80);
    const title = text(body.title, 160);
    const dueLabel = text(body.dueLabel, 160) || null;
    const level = Number.isInteger(body.level) ? Math.max(1, Math.min(Number(body.level), 3)) : 1;
    const targetRounds = Number.isInteger(body.targetRounds)
      ? Math.max(1, Math.min(Number(body.targetRounds), 100))
      : 10;
    if (!skill || !title) return Response.json({ error: "Skill and title are required." }, { status: 400 });
    const { data, error } = await db
      .from("practice_assignments")
      .insert({ period_id: periodId, skill, title, level, target_rounds: targetRounds, due_label: dueLabel, status: "open" })
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ assignment: data }, { status: 201 });
  }

  if (action === "set-status") {
    const assignmentId = text(body.assignmentId, 80);
    const status = body.status === "closed" ? "closed" : body.status === "open" ? "open" : null;
    if (!assignmentId || !status) return Response.json({ error: "Assignment and valid status are required." }, { status: 400 });
    const { data, error } = await db.from("practice_assignments").update({ status }).eq("id", assignmentId).select("id,status").maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Assignment not found." }, { status: 404 });
    return Response.json({ assignment: data });
  }

  if (action === "delete") {
    const assignmentId = text(body.assignmentId, 80);
    if (!assignmentId || body.confirm !== true) {
      return Response.json({ error: "Deleting an assignment requires explicit confirmation." }, { status: 400 });
    }
    const { error } = await db.from("practice_assignments").delete().eq("id", assignmentId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ deleted: true });
  }

  return Response.json({ error: "Unknown assignment action." }, { status: 400 });
}
