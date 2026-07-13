import { recordSecurityEvent } from "@/lib/securityAudit";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type SessionAction =
  | { action: "start"; periodId?: unknown; joinCode?: unknown; assignmentId?: unknown }
  | { action: "update"; sessionId?: unknown; broadcast?: unknown; liveFlow?: unknown; abbie?: unknown; remoteCommand?: unknown }
  | { action: "close"; sessionId?: unknown };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "";

  if (!sessionId) {
    const { data, error } = await db
      .from("sessions")
      .select("id,period_id,assignment_id,join_code,status,started_at,ended_at,broadcast,live_flow,abbie,remote_command")
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ sessions: data ?? [] }, { headers: { "cache-control": "no-store" } });
  }

  const [sessionResult, joinResult, pollResult] = await Promise.all([
    db.from("sessions")
      .select("id,period_id,assignment_id,join_code,status,started_at,ended_at,broadcast,live_flow,abbie,remote_command")
      .eq("id", sessionId)
      .maybeSingle(),
    db.from("session_joins")
      .select("id,student_id,display_name,joined_at")
      .eq("session_id", sessionId)
      .order("joined_at"),
    db.from("polls")
      .select("id,question,choices,kind,status,correct_answer,created_at,lesson_code,notion_step_id,standard_id")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
  ]);
  if (sessionResult.error) return Response.json({ error: sessionResult.error.message }, { status: 500 });
  if (!sessionResult.data) return Response.json({ error: "Session not found." }, { status: 404 });
  if (joinResult.error) return Response.json({ error: joinResult.error.message }, { status: 500 });
  if (pollResult.error) return Response.json({ error: pollResult.error.message }, { status: 500 });

  const pollIds = (pollResult.data ?? []).map((poll) => poll.id);
  const answerResult = pollIds.length
    ? await db.from("poll_answers")
      .select("id,poll_id,student_id,display_name,answer,created_at")
      .in("poll_id", pollIds)
      .order("created_at")
    : { data: [], error: null };
  if (answerResult.error) return Response.json({ error: answerResult.error.message }, { status: 500 });

  return Response.json(
    {
      session: sessionResult.data,
      joins: joinResult.data ?? [],
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

    const { data, error: updateError } = await db
      .from("sessions")
      .update(patch)
      .eq("id", sessionId)
      .eq("status", "open")
      .select("id,status,broadcast,live_flow,abbie,remote_command")
      .maybeSingle();
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
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
