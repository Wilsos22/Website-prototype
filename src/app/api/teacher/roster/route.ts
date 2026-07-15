import { recordSecurityEvent } from "@/lib/securityAudit";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type RosterAction =
  | { action: "create-period"; name?: unknown; sortOrder?: unknown }
  | { action: "create-student"; periodId?: unknown; fullName?: unknown; email?: unknown }
  | { action: "update-student"; studentId?: unknown; periodId?: unknown; fullName?: unknown; email?: unknown }
  | { action: "delete-student"; studentId?: unknown; expectedName?: unknown; confirm?: unknown }
  | { action: "delete-period"; periodId?: unknown; expectedName?: unknown; confirm?: unknown };

type RosterDeletionResolution = {
  outcome: string;
  deleted_id: string | null;
  deleted_name: string | null;
  dependency_counts: Record<string, number> | null;
};

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function uuid(value: unknown): string {
  const id = text(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

function email(value: unknown): string | null {
  const normalized = text(value, 254).toLowerCase();
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

function isMissingRosterDeletionRpc(code?: string): boolean {
  return code === "42883" || code === "PGRST202";
}

function dependencyEntries(counts: Record<string, number> | null): Array<{ label: string; count: number }> {
  if (!counts) return [];
  return Object.entries(counts)
    .filter((entry): entry is [string, number] => Number.isFinite(entry[1]) && entry[1] > 0)
    .map(([label, count]) => ({ label, count }));
}

function dependencySummary(counts: Record<string, number> | null): string {
  return dependencyEntries(counts).map((item) => `${item.count} ${item.label}`).join(", ");
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
    const studentId = uuid(body.studentId);
    const expectedName = text(body.expectedName, 120);
    if (!studentId || !expectedName || body.confirm !== true) {
      return Response.json(
        { error: "Deleting a student requires a valid ID, the current name, and explicit confirmation." },
        { status: 400 },
      );
    }

    const deletionResult = await db.rpc("bdm_delete_unused_roster_student", {
      p_student_id: studentId,
      p_expected_name: expectedName,
    });
    if (deletionResult.error) {
      if (isMissingRosterDeletionRpc(deletionResult.error.code)) {
        return Response.json(
          { error: "Safe roster deletion is not configured yet. Apply the atomic roster deletion migration first." },
          { status: 503 },
        );
      }
      return Response.json({ error: deletionResult.error.message }, { status: 500 });
    }

    const resolution = ((deletionResult.data as RosterDeletionResolution[] | null) ?? [])[0];
    if (!resolution) return Response.json({ error: "Student deletion returned no result." }, { status: 500 });
    if (resolution.outcome === "not_found") return Response.json({ error: "Student not found." }, { status: 404 });
    if (resolution.outcome === "name_conflict") {
      void recordSecurityEvent({
        eventType: "teacher_roster_change",
        outcome: "conflict",
        details: { action: body.action, reason: resolution.outcome, requestedStudentId: studentId },
      });
      return Response.json(
        { error: "The student name changed. Refresh the roster before deleting." },
        { status: 409 },
      );
    }
    if (resolution.outcome === "student_has_attribution") {
      const dependencies = dependencyEntries(resolution.dependency_counts);
      void recordSecurityEvent({
        eventType: "teacher_roster_change",
        outcome: "conflict",
        details: { action: body.action, reason: resolution.outcome, requestedStudentId: studentId },
      });
      return Response.json(
        {
          error: `${resolution.deleted_name || expectedName} has saved roster or instructional records (${dependencySummary(resolution.dependency_counts)}) and was not deleted.`,
          code: "student_has_attribution",
          dependencies,
        },
        { status: 409 },
      );
    }
    if (resolution.outcome !== "deleted" || !resolution.deleted_id || !resolution.deleted_name) {
      void recordSecurityEvent({
        eventType: "teacher_roster_change",
        outcome: "conflict",
        details: { action: body.action, reason: resolution.outcome, requestedStudentId: studentId },
      });
      return Response.json(
        { error: "This student gained related records and was not deleted. Refresh and try again." },
        { status: 409 },
      );
    }

    await recordSecurityEvent({
      eventType: "teacher_roster_change",
      outcome: "allowed",
      details: {
        action: body.action,
        deletedStudentId: resolution.deleted_id,
        deletedStudentName: resolution.deleted_name,
      },
    });
    return Response.json({ deleted: true, studentId: resolution.deleted_id });
  }

  if (body.action === "delete-period") {
    const periodId = uuid(body.periodId);
    const expectedName = text(body.expectedName, 80);
    if (!periodId || !expectedName || body.confirm !== true) {
      return Response.json(
        { error: "Deleting a class requires a valid ID, the current name, and explicit confirmation." },
        { status: 400 },
      );
    }

    const deletionResult = await db.rpc("bdm_delete_unused_roster_period", {
      p_period_id: periodId,
      p_expected_name: expectedName,
    });
    if (deletionResult.error) {
      if (isMissingRosterDeletionRpc(deletionResult.error.code)) {
        return Response.json(
          { error: "Safe roster deletion is not configured yet. Apply the atomic roster deletion migration first." },
          { status: 503 },
        );
      }
      return Response.json({ error: deletionResult.error.message }, { status: 500 });
    }

    const resolution = ((deletionResult.data as RosterDeletionResolution[] | null) ?? [])[0];
    if (!resolution) return Response.json({ error: "Class deletion returned no result." }, { status: 500 });
    if (resolution.outcome === "not_found") return Response.json({ error: "Class period not found." }, { status: 404 });
    if (resolution.outcome === "name_conflict") {
      void recordSecurityEvent({
        eventType: "teacher_roster_change",
        outcome: "conflict",
        details: { action: body.action, reason: resolution.outcome, requestedPeriodId: periodId },
      });
      return Response.json(
        { error: "The class name changed. Refresh the roster before deleting." },
        { status: 409 },
      );
    }
    if (resolution.outcome === "period_has_dependencies") {
      const dependencies = dependencyEntries(resolution.dependency_counts);
      const students = dependencies.find((item) => item.label === "students")?.count ?? 0;
      void recordSecurityEvent({
        eventType: "teacher_roster_change",
        outcome: "conflict",
        details: { action: body.action, reason: resolution.outcome, requestedPeriodId: periodId },
      });
      if (students > 0) {
        return Response.json(
          {
            error: `${resolution.deleted_name || expectedName} still has ${students} student${students === 1 ? "" : "s"}. Move or delete those students first.`,
            code: "period_has_students",
            studentCount: students,
            dependencies,
          },
          { status: 409 },
        );
      }
      return Response.json(
        {
          error: `${resolution.deleted_name || expectedName} has instructional history (${dependencySummary(resolution.dependency_counts)}) and was not deleted.`,
          code: "period_has_instructional_history",
          dependencies,
        },
        { status: 409 },
      );
    }
    if (resolution.outcome !== "deleted" || !resolution.deleted_id || !resolution.deleted_name) {
      void recordSecurityEvent({
        eventType: "teacher_roster_change",
        outcome: "conflict",
        details: { action: body.action, reason: resolution.outcome, requestedPeriodId: periodId },
      });
      return Response.json(
        { error: "This class gained related records and was not deleted. Refresh and try again." },
        { status: 409 },
      );
    }

    await recordSecurityEvent({
      eventType: "teacher_roster_change",
      outcome: "allowed",
      details: {
        action: body.action,
        deletedPeriodId: resolution.deleted_id,
        deletedPeriodName: resolution.deleted_name,
      },
    });
    return Response.json({ deleted: true, periodId: resolution.deleted_id });
  }

  return Response.json({ error: "Unknown roster action." }, { status: 400 });
}
