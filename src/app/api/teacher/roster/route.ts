import { recordSecurityEvent } from "@/lib/securityAudit";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type RosterAction =
  | { action: "create-period"; name?: unknown; sortOrder?: unknown }
  | { action: "create-student"; periodId?: unknown; fullName?: unknown; email?: unknown }
  | { action: "update-student"; studentId?: unknown; periodId?: unknown; fullName?: unknown; email?: unknown }
  | { action: "delete-student"; studentId?: unknown; confirm?: unknown };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function email(value: unknown): string | null {
  const normalized = text(value, 254).toLowerCase();
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

export async function GET() {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  const [periodResult, studentResult] = await Promise.all([
    db.from("periods").select("id,name,sort_order").order("sort_order"),
    db.from("students").select("id,period_id,full_name,email,auth_user_id").order("full_name"),
  ]);
  if (periodResult.error) return Response.json({ error: periodResult.error.message }, { status: 500 });
  if (studentResult.error) return Response.json({ error: studentResult.error.message }, { status: 500 });

  return Response.json(
    {
      periods: periodResult.data ?? [],
      students: (studentResult.data ?? []).map((student) => ({
        id: student.id,
        periodId: student.period_id,
        fullName: student.full_name,
        email: student.email,
        identityLinked: Boolean(student.auth_user_id),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as RosterAction;

  if (body.action === "create-period") {
    const name = text(body.name, 80);
    const sortOrder = Number.isInteger(body.sortOrder) ? Math.max(0, Math.min(Number(body.sortOrder), 100)) : 0;
    if (!name) return Response.json({ error: "Period name is required." }, { status: 400 });
    const { data, error: insertError } = await db
      .from("periods")
      .insert({ name, sort_order: sortOrder })
      .select("id,name,sort_order")
      .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
    void recordSecurityEvent({ eventType: "teacher_roster_change", outcome: "allowed", details: { action: body.action } });
    return Response.json({ period: data }, { status: 201 });
  }

  if (body.action === "create-student") {
    const periodId = text(body.periodId, 80);
    const fullName = text(body.fullName, 120);
    const studentEmail = email(body.email);
    if (!periodId || !fullName) return Response.json({ error: "Period and student name are required." }, { status: 400 });
    if (text(body.email, 254) && !studentEmail) return Response.json({ error: "Enter a valid school email." }, { status: 400 });
    const { data, error: insertError } = await db
      .from("students")
      .insert({ period_id: periodId, full_name: fullName, email: studentEmail })
      .select("id,period_id,full_name,email")
      .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
    void recordSecurityEvent({
      eventType: "teacher_roster_change",
      outcome: "allowed",
      studentId: data.id,
      details: { action: body.action },
    });
    return Response.json({ student: data }, { status: 201 });
  }

  if (body.action === "update-student") {
    const studentId = text(body.studentId, 80);
    const periodId = text(body.periodId, 80);
    const fullName = text(body.fullName, 120);
    const studentEmail = email(body.email);
    if (!studentId || !periodId || !fullName) {
      return Response.json({ error: "Student, period, and name are required." }, { status: 400 });
    }
    if (text(body.email, 254) && !studentEmail) return Response.json({ error: "Enter a valid school email." }, { status: 400 });
    const { data, error: updateError } = await db
      .from("students")
      .update({ period_id: periodId, full_name: fullName, email: studentEmail })
      .eq("id", studentId)
      .select("id,period_id,full_name,email")
      .maybeSingle();
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
    if (!data) return Response.json({ error: "Student not found." }, { status: 404 });
    void recordSecurityEvent({
      eventType: "teacher_roster_change",
      outcome: "allowed",
      studentId,
      details: { action: body.action },
    });
    return Response.json({ student: data });
  }

  if (body.action === "delete-student") {
    const studentId = text(body.studentId, 80);
    if (!studentId || body.confirm !== true) {
      return Response.json({ error: "Deleting a student requires explicit confirmation." }, { status: 400 });
    }
    const { error: deleteError } = await db.from("students").delete().eq("id", studentId);
    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
    void recordSecurityEvent({
      eventType: "teacher_roster_change",
      outcome: "allowed",
      details: { action: body.action },
    });
    return Response.json({ deleted: true });
  }

  return Response.json({ error: "Unknown roster action." }, { status: 400 });
}
