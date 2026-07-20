import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type SpinnerStudentRow = {
  id: string;
  full_name: string;
};

function uuid(value: string | null): string {
  const id = value?.trim() || "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : "";
}

function spinnerStudents(rows: SpinnerStudentRow[]) {
  return rows.map((student) => ({
    id: student.id,
    fullName: student.full_name,
  }));
}

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  const searchParams = new URL(request.url).searchParams;
  const sessionId = uuid(searchParams.get("sessionId"));
  const requestedPeriodId = uuid(searchParams.get("periodId"));
  const minimum = searchParams.get("minimum") === "2" ? 2 : 1;
  if (!sessionId && !requestedPeriodId) {
    return Response.json({ error: "An active session or class period is required." }, { status: 400 });
  }

  let periodId = requestedPeriodId;
  if (sessionId) {
    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,period_id,status")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });
    if (!session || session.status !== "open") {
      return Response.json({ error: "This class session is no longer open." }, { status: 404 });
    }
    if (periodId && periodId !== session.period_id) {
      return Response.json({ error: "The session does not belong to this class period." }, { status: 409 });
    }
    periodId = session.period_id;

    const { data: joins, error: joinError } = await db
      .from("session_joins")
      .select("student_id")
      .eq("session_id", sessionId)
      .not("student_id", "is", null);
    if (joinError) return Response.json({ error: joinError.message }, { status: 500 });

    const joinedIds = [...new Set((joins ?? [])
      .map((join) => join.student_id)
      .filter((studentId): studentId is string => typeof studentId === "string" && Boolean(studentId)))];
    if (joinedIds.length >= minimum) {
      const { data: joinedStudents, error: joinedStudentError } = await db
        .from("students")
        .select("id,full_name")
        .eq("period_id", periodId)
        .in("id", joinedIds)
        .order("full_name");
      if (joinedStudentError) return Response.json({ error: joinedStudentError.message }, { status: 500 });
      if ((joinedStudents ?? []).length >= minimum) {
        return Response.json(
          { students: spinnerStudents(joinedStudents ?? []), source: "session" },
          { headers: { "cache-control": "no-store" } },
        );
      }
    }
  }

  const { data: students, error: studentError } = await db
    .from("students")
    .select("id,full_name")
    .eq("period_id", periodId)
    .order("full_name");
  if (studentError) return Response.json({ error: studentError.message }, { status: 500 });
  return Response.json(
    { students: spinnerStudents(students ?? []), source: "period" },
    { headers: { "cache-control": "no-store" } },
  );
}
