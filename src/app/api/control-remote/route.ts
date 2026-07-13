import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { LIVE_FLOW_MODE, type TeacherRemoteAction, type TeacherRemoteCommand } from "@/lib/liveClassFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<TeacherRemoteAction>([
  "next",
  "previous",
  "toggle-timer",
  "add-30",
  "subtract-30",
  "reset-timer",
]);

async function activeSession() {
  const db = getSupabaseAdmin();
  if (!db) return { db: null, session: null, error: "Database not configured." };
  const { data, error } = await db
    .from("sessions")
    .select("id,join_code,remote_command,started_at")
    .eq("status", "open")
    .eq("broadcast", LIVE_FLOW_MODE)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { db, session: data as { id: string; join_code: string | null; remote_command: TeacherRemoteCommand | null } | null, error: error?.message || null };
}

export async function GET() {
  const result = await activeSession();
  if (!result.db) return Response.json({ connected: false, error: result.error }, { status: 503 });
  if (result.error) return Response.json({ connected: false, error: result.error }, { status: 500 });
  return Response.json({ connected: true, session: result.session ? { id: result.session.id, joinCode: result.session.join_code } : null });
}

export async function POST(request: Request) {
  const result = await activeSession();
  if (!result.db) return Response.json({ error: result.error }, { status: 503 });
  if (!result.session) return Response.json({ error: "No Live Class Flow session is open." }, { status: 404 });
  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.action || !ACTIONS.has(body.action as TeacherRemoteAction)) {
    return Response.json({ error: "Unknown remote action." }, { status: 400 });
  }
  const command: TeacherRemoteCommand = {
    nonce: crypto.randomUUID(),
    action: body.action as TeacherRemoteAction,
    issuedAt: new Date().toISOString(),
  };
  const { error } = await result.db.from("sessions").update({ remote_command: command }).eq("id", result.session.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, command });
}
