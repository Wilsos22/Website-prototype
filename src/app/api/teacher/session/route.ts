import { recordSecurityEvent } from "@/lib/securityAudit";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type SessionAction =
  | { action: "start"; periodId?: unknown; joinCode?: unknown; assignmentId?: unknown }
  | { action: "update"; sessionId?: unknown; broadcast?: unknown; liveFlow?: unknown; expectedLiveFlowUpdatedAt?: unknown; abbie?: unknown; remoteCommand?: unknown; expectedRemoteCommandNonce?: unknown }
  | { action: "admit"; sessionId?: unknown; requestCode?: unknown; studentEmail?: unknown }
  | { action: "close"; sessionId?: unknown };

type AdmissionResolution = {
  outcome: string;
  join_id: string | null;
  resolved_student_id: string | null;
  resolved_display_name: string | null;
  resolved_joined_at: string | null;
};

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isMissingAdmissionSchema(code?: string): boolean {
  return code === "42703" || code === "42883" || code === "PGRST202" || code === "PGRST204";
}

async function admissionFailure(input: {
  status: number;
  message: string;
  reason: string;
  outcome: "denied" | "conflict" | "error";
  sessionId?: string | null;
  studentId?: string | null;
  authUserId?: string | null;
}): Promise<Response> {
  await recordSecurityEvent({
    eventType: "teacher_student_admit",
    outcome: input.outcome,
    sessionId: input.sessionId,
    studentId: input.studentId,
    authUserId: input.authUserId,
    details: { reason: input.reason },
  });
  return Response.json(
    { error: input.message, code: input.reason },
    { status: input.status, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const searchParams = new URL(request.url).searchParams;
  const sessionId = searchParams.get("sessionId") || "";
  const liveSessionId = searchParams.get("liveSessionId") || "";
  const latestOpen = searchParams.get("latestOpen") === "1";

  // Projectors and the live host only need the current session row. Keep this
  // path intentionally small because those classroom surfaces poll frequently.
  if (liveSessionId || latestOpen) {
    let query = db
      .from("sessions")
      .select("id,period_id,assignment_id,join_code,status,started_at,ended_at,broadcast,live_flow,abbie,remote_command")
      .eq("status", "open");
    query = liveSessionId
      ? query.eq("id", liveSessionId)
      : query.order("started_at", { ascending: false }).limit(1);
    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ sessions: data ?? [] }, { headers: { "cache-control": "no-store" } });
  }

  if (!sessionId) {
    const { data, error } = await db
      .from("sessions")
      .select("id,period_id,assignment_id,join_code,status,started_at,ended_at,broadcast,live_flow,abbie,remote_command")
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ sessions: data ?? [] }, { headers: { "cache-control": "no-store" } });
  }

  const [sessionResult, joinResult, admissionResult, pollResult] = await Promise.all([
    db.from("sessions")
      .select("id,period_id,assignment_id,join_code,status,started_at,ended_at,broadcast,live_flow,abbie,remote_command")
      .eq("id", sessionId)
      .maybeSingle(),
    db.from("session_joins")
      .select("id,student_id,display_name,joined_at")
      .eq("session_id", sessionId)
      .order("joined_at"),
    db.from("session_joins")
      .select("id,request_code,joined_at")
      .eq("session_id", sessionId)
      .is("student_id", null)
      .not("auth_user_id", "is", null)
      .not("request_code", "is", null)
      .order("joined_at"),
    db.from("polls")
      .select("id,question,choices,kind,status,correct_answer,created_at,lesson_code,notion_step_id,standard_id")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
  ]);
  if (sessionResult.error) return Response.json({ error: sessionResult.error.message }, { status: 500 });
  if (!sessionResult.data) return Response.json({ error: "Session not found." }, { status: 404 });
  if (joinResult.error) return Response.json({ error: joinResult.error.message }, { status: 500 });
  if (admissionResult.error && !isMissingAdmissionSchema(admissionResult.error.code)) {
    return Response.json({ error: admissionResult.error.message }, { status: 500 });
  }
  if (pollResult.error) return Response.json({ error: pollResult.error.message }, { status: 500 });

  const pollIds = (pollResult.data ?? []).map((poll) => poll.id);
  const answerResult = pollIds.length
    ? await db.from("poll_answers")
      .select("id,poll_id,student_id,display_name,answer,created_at")
      .in("poll_id", pollIds)
      .order("created_at")
    : { data: [], error: null };
  if (answerResult.error) return Response.json({ error: answerResult.error.message }, { status: 500 });

  const admissionRows = admissionResult.error ? [] : (admissionResult.data ?? []);
  const admissionIds = new Set(admissionRows.map((row) => row.id));

  return Response.json(
    {
      session: sessionResult.data,
      joins: (joinResult.data ?? []).filter((row) => !admissionIds.has(row.id)),
      admissionRequests: admissionRows.map((row) => ({
        id: row.id,
        requestCode: row.request_code,
        requestedAt: row.joined_at,
      })),
      polls: pollResult.data ?? [],
      pollAnswers: answerResult.data ?? [],
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as SessionAction;

  if (body.action === "admit") {
    const sessionId = text(body.sessionId, 80);
    const requestCode = text(body.requestCode, 6).toUpperCase();
    const studentEmail = text(body.studentEmail, 320).toLowerCase();
    if (!sessionId || !/^[A-HJ-NP-Z2-9]{6}$/.test(requestCode) || !/^[^\s@]+@[^\s@]+$/.test(studentEmail)) {
      return admissionFailure({
        status: 400,
        message: "A session, request code, and roster email are required.",
        reason: "invalid_admission_request",
        outcome: "denied",
        sessionId: sessionId || null,
      });
    }

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,period_id,status")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) {
      return admissionFailure({
        status: 500,
        message: "The class session could not be checked.",
        reason: "session_lookup_failed",
        outcome: "error",
        sessionId,
      });
    }
    if (!session || session.status !== "open") {
      return admissionFailure({
        status: 404,
        message: "This class session is no longer open.",
        reason: "session_not_open",
        outcome: "denied",
        sessionId,
      });
    }

    const { data: student, error: studentError } = await db
      .from("students")
      .select("id,period_id,full_name,email,auth_user_id")
      .ilike("email", studentEmail)
      .maybeSingle();
    if (studentError) {
      return admissionFailure({
        status: 500,
        message: "The roster could not be checked.",
        reason: "roster_lookup_failed",
        outcome: "error",
        sessionId,
      });
    }
    if (!student || student.period_id !== session.period_id || !student.email) {
      return admissionFailure({
        status: 403,
        message: "Choose a student from this session's roster.",
        reason: "roster_period_mismatch",
        outcome: "denied",
        sessionId,
        studentId: student?.id ?? null,
      });
    }

    const { data: pending, error: pendingError } = await db
      .from("session_joins")
      .select("id,auth_user_id,request_code")
      .eq("session_id", sessionId)
      .eq("request_code", requestCode)
      .is("student_id", null)
      .maybeSingle();
    if (pendingError) {
      if (isMissingAdmissionSchema(pendingError.code)) {
        return admissionFailure({
          status: 503,
          message: "Teacher admission is not configured yet.",
          reason: "admission_schema_missing",
          outcome: "error",
          sessionId,
          studentId: student.id,
        });
      }
      return admissionFailure({
        status: 500,
        message: "The Chromebook request could not be checked.",
        reason: "request_lookup_failed",
        outcome: "error",
        sessionId,
        studentId: student.id,
      });
    }
    if (!pending?.auth_user_id) {
      return admissionFailure({
        status: 404,
        message: "That Chromebook request is no longer waiting.",
        reason: "request_not_found",
        outcome: "denied",
        sessionId,
        studentId: student.id,
      });
    }

    const { data: existingStudentJoin, error: existingStudentJoinError } = await db
      .from("session_joins")
      .select("id")
      .eq("session_id", sessionId)
      .eq("student_id", student.id)
      .maybeSingle();
    if (existingStudentJoinError) {
      return admissionFailure({
        status: 500,
        message: "The student's current session join could not be checked.",
        reason: "existing_join_lookup_failed",
        outcome: "error",
        sessionId,
        studentId: student.id,
        authUserId: pending.auth_user_id,
      });
    }
    if (existingStudentJoin) {
      return admissionFailure({
        status: 409,
        message: "This student is already joined on another Chromebook.",
        reason: "student_already_joined",
        outcome: "conflict",
        sessionId,
        studentId: student.id,
        authUserId: pending.auth_user_id,
      });
    }

    const { data: requestAuth, error: requestAuthError } = await db.auth.admin.getUserById(pending.auth_user_id);
    if (requestAuthError || !requestAuth.user) {
      return admissionFailure({
        status: 409,
        message: "That Chromebook sign-in is no longer available.",
        reason: "request_identity_missing",
        outcome: "conflict",
        sessionId,
        studentId: student.id,
        authUserId: pending.auth_user_id,
      });
    }
    if (!requestAuth.user.is_anonymous) {
      return admissionFailure({
        status: 409,
        message: "That Chromebook now has a verified sign-in and should join directly.",
        reason: "request_identity_not_anonymous",
        outcome: "conflict",
        sessionId,
        studentId: student.id,
        authUserId: pending.auth_user_id,
      });
    }

    if (student.auth_user_id && student.auth_user_id !== pending.auth_user_id) {
      const { data: currentAuth, error: currentAuthError } = await db.auth.admin.getUserById(student.auth_user_id);
      if (currentAuthError || !currentAuth.user) {
        return admissionFailure({
          status: 409,
          message: "The student's current sign-in could not be safely replaced.",
          reason: "current_identity_missing",
          outcome: "conflict",
          sessionId,
          studentId: student.id,
          authUserId: pending.auth_user_id,
        });
      }
      if (!currentAuth.user.is_anonymous) {
        return admissionFailure({
          status: 409,
          message: "This roster student already has a permanent sign-in.",
          reason: "permanent_identity_conflict",
          outcome: "conflict",
          sessionId,
          studentId: student.id,
          authUserId: pending.auth_user_id,
        });
      }
    }

    const resolutionResult = await db.rpc("bdm_admit_student_join_request", {
      p_session_id: sessionId,
      p_request_code: requestCode,
      p_student_id: student.id,
      p_student_email: student.email,
      p_auth_user_id: pending.auth_user_id,
      p_expected_student_auth_user_id: student.auth_user_id,
      p_display_name: student.full_name,
    });
    if (resolutionResult.error) {
      if (isMissingAdmissionSchema(resolutionResult.error.code)) {
        return admissionFailure({
          status: 503,
          message: "Teacher admission is not configured yet.",
          reason: "admission_schema_missing",
          outcome: "error",
          sessionId,
          studentId: student.id,
          authUserId: pending.auth_user_id,
        });
      }
      return admissionFailure({
        status: 500,
        message: "The student could not be admitted.",
        reason: "admission_save_failed",
        outcome: "error",
        sessionId,
        studentId: student.id,
        authUserId: pending.auth_user_id,
      });
    }

    const resolution = ((resolutionResult.data as AdmissionResolution[] | null) ?? [])[0];
    if (!resolution || resolution.outcome !== "admitted" || !resolution.join_id || !resolution.resolved_student_id) {
      const reason = resolution?.outcome || "admission_conflict";
      const denied = reason === "session_not_open" || reason === "request_not_found" || reason === "roster_mismatch";
      return admissionFailure({
        status: reason === "session_not_open" || reason === "request_not_found" ? 404 : 409,
        message: reason === "student_already_joined"
          ? "This student is already joined on another Chromebook."
          : denied
            ? "The session or Chromebook request changed. Refresh and try again."
            : "The student sign-in changed. Refresh before admitting this Chromebook.",
        reason,
        outcome: denied ? "denied" : "conflict",
        sessionId,
        studentId: student.id,
        authUserId: pending.auth_user_id,
      });
    }

    await recordSecurityEvent({
      eventType: "teacher_student_admit",
      outcome: "allowed",
      sessionId,
      studentId: resolution.resolved_student_id,
      authUserId: pending.auth_user_id,
      details: { action: "admit" },
    });
    return Response.json(
      {
        sessionJoin: {
          id: resolution.join_id,
          studentId: resolution.resolved_student_id,
          displayName: resolution.resolved_display_name || student.full_name,
          joinedAt: resolution.resolved_joined_at,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  if (body.action === "start") {
    const periodId = text(body.periodId, 80);
    const joinCode = text(body.joinCode, 8).toUpperCase();
    const assignmentId = text(body.assignmentId, 80) || null;
    if (!periodId || !/^[A-Z0-9]{2,8}$/.test(joinCode)) {
      return Response.json({ error: "A valid period and join code are required." }, { status: 400 });
    }

    const { data: period, error: periodError } = await db.from("periods").select("id").eq("id", periodId).maybeSingle();
    if (periodError) return Response.json({ error: periodError.message }, { status: 500 });
    if (!period) return Response.json({ error: "Period not found." }, { status: 404 });

    const { data, error: insertError } = await db
      .from("sessions")
      .insert({ period_id: periodId, assignment_id: assignmentId, join_code: joinCode, status: "open", broadcast: "/lesson" })
      .select("id,period_id,assignment_id,join_code,status,started_at,broadcast")
      .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
    void recordSecurityEvent({
      eventType: "teacher_session_change",
      outcome: "allowed",
      sessionId: data.id,
      details: { action: body.action },
    });
    return Response.json({ session: data }, { status: 201 });
  }

  if (body.action === "update") {
    const sessionId = text(body.sessionId, 80);
    if (!sessionId) return Response.json({ error: "Session is required." }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if ("broadcast" in body) patch.broadcast = typeof body.broadcast === "string" ? text(body.broadcast, 300) : null;
    if ("liveFlow" in body) patch.live_flow = body.liveFlow ?? null;
    if ("abbie" in body) patch.abbie = body.abbie ?? null;
    if ("remoteCommand" in body) patch.remote_command = body.remoteCommand ?? null;
    if (!Object.keys(patch).length) return Response.json({ error: "No session fields were supplied." }, { status: 400 });

    let update = db
      .from("sessions")
      .update(patch)
      .eq("id", sessionId)
      .eq("status", "open");
    const checksLiveFlowRevision = "liveFlow" in body && "expectedLiveFlowUpdatedAt" in body;
    if (checksLiveFlowRevision) {
      const expectedRevision = text(body.expectedLiveFlowUpdatedAt, 80);
      update = expectedRevision
        ? update.filter("live_flow->>updatedAt", "eq", expectedRevision)
        : update.is("live_flow", null);
    }
    const checksRemoteCommandNonce = "remoteCommand" in body && "expectedRemoteCommandNonce" in body;
    if (checksRemoteCommandNonce) {
      const expectedNonce = text(body.expectedRemoteCommandNonce, 80);
      update = expectedNonce
        ? update.filter("remote_command->>nonce", "eq", expectedNonce)
        : update.is("remote_command", null);
    }
    const { data, error: updateError } = await update
      .select("id,status,broadcast,live_flow,abbie,remote_command")
      .maybeSingle();
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
    if (!data && checksLiveFlowRevision) {
      return Response.json({ error: "The live lesson changed on another teacher device. Control is reconnecting to the newer state." }, { status: 409 });
    }
    if (!data && checksRemoteCommandNonce) {
      return Response.json({ error: "A newer classroom command replaced this receipt." }, { status: 409 });
    }
    if (!data) return Response.json({ error: "Open session not found." }, { status: 404 });
    return Response.json({ session: data });
  }

  if (body.action === "close") {
    const sessionId = text(body.sessionId, 80);
    if (!sessionId) return Response.json({ error: "Session is required." }, { status: 400 });
    const now = new Date().toISOString();
    const [pollResult, sessionResult] = await Promise.all([
      db.from("polls").update({ status: "closed" }).eq("session_id", sessionId).eq("status", "open"),
      db.from("sessions")
        .update({ status: "closed", ended_at: now, broadcast: null, live_flow: null, abbie: null, remote_command: null })
        .eq("id", sessionId)
        .select("id")
        .maybeSingle(),
    ]);
    if (pollResult.error) return Response.json({ error: pollResult.error.message }, { status: 500 });
    if (sessionResult.error) return Response.json({ error: sessionResult.error.message }, { status: 500 });
    if (!sessionResult.data) return Response.json({ error: "Session not found." }, { status: 404 });
    void recordSecurityEvent({
      eventType: "teacher_session_change",
      outcome: "allowed",
      sessionId,
      details: { action: body.action },
    });
    return Response.json({ closed: true });
  }

  return Response.json({ error: "Unknown session action." }, { status: 400 });
}
