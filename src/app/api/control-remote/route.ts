import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  LIVE_FLOW_MODE,
  TEACHER_REMOTE_ACTIONS,
  type LiveClassFlowSnapshot,
  type TeacherRemoteAction,
  type TeacherRemoteCommand,
} from "@/lib/liveClassFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<string>(TEACHER_REMOTE_ACTIONS);

interface RemoteSessionRow {
  id: string;
  join_code: string | null;
  remote_command: TeacherRemoteCommand | null;
  started_at: string;
  live_flow: LiveClassFlowSnapshot | null;
}

async function openSessions() {
  const db = getSupabaseAdmin();
  if (!db) return { db: null, sessions: [] as RemoteSessionRow[], error: "Database not configured." };
  const { data, error } = await db
    .from("sessions")
    .select("id,join_code,remote_command,started_at,live_flow")
    .eq("status", "open")
    .eq("broadcast", LIVE_FLOW_MODE)
    .order("started_at", { ascending: false });
  return { db, sessions: (data ?? []) as RemoteSessionRow[], error: error?.message || null };
}

function serializeSession(session: RemoteSessionRow) {
  return {
    id: session.id,
    joinCode: session.join_code,
    startedAt: session.started_at,
    remoteCommand: session.remote_command,
    liveFlow: session.live_flow,
  };
}

export async function GET(request: Request) {
  const result = await openSessions();
  if (!result.db) return Response.json({ connected: false, error: result.error }, { status: 503 });
  if (result.error) return Response.json({ connected: false, error: result.error }, { status: 500 });
  const requestedSessionId = new URL(request.url).searchParams.get("sessionId") || "";
  const requestedSession = requestedSessionId
    ? result.sessions.find((session) => session.id === requestedSessionId) ?? null
    : null;
  return Response.json({
    connected: true,
    session: requestedSession ? serializeSession(requestedSession) : null,
    sessions: result.sessions.map(serializeSession),
  });
}

export async function POST(request: Request) {
  const result = await openSessions();
  if (!result.db) return Response.json({ error: result.error }, { status: 503 });
  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  let body: { action?: string; sessionId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) return Response.json({ error: "Confirm a class session before sending a command." }, { status: 400 });
  const session = result.sessions.find((candidate) => candidate.id === sessionId) ?? null;
  if (!session) return Response.json({ error: "The selected Live Class Flow session is not open." }, { status: 404 });
  if (!body.action || !ACTIONS.has(body.action as TeacherRemoteAction)) {
    return Response.json({ error: "Unknown remote action." }, { status: 400 });
  }
  const command: TeacherRemoteCommand = {
    nonce: crypto.randomUUID(),
    action: body.action as TeacherRemoteAction,
    issuedAt: new Date().toISOString(),
  };
  const { error } = await result.db.from("sessions").update({ remote_command: command }).eq("id", session.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, command });
}
