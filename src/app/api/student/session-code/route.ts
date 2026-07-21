import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { LiveClassFlowSnapshot } from "@/lib/liveClassFlow";
import { periodExistsForClassCode, withinSchoolHours } from "@/lib/periodClassCodes";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{2,8}$/.test(code)) {
    return Response.json({ open: false }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Live sessions are not configured." }, { status: 503 });
  const { data, error } = await db
    .from("sessions")
    .select("id,live_flow")
    .eq("join_code", code)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (error) return Response.json({ error: "The class code could not be checked." }, { status: 500 });
  const session = data as { id: string; live_flow: LiveClassFlowSnapshot | null } | null;
  const currentWarmUpLink = session?.live_flow?.state?.id === "warmup"
    ? session.live_flow.resource?.url || null
    : null;
  const lessonWarmUpLink = session?.live_flow?.sequence?.steps
    ?.find((step) => step.stateId === "warmup")
    ?.resourceUrl || null;
  const warmUpLink = currentWarmUpLink || lessonWarmUpLink;
  // Instant warm-up access: a period's permanent class code is a valid entry
  // even before any session exists. Recognition only - the session itself is
  // created by the authenticated warmup-start call that follows, so an
  // unauthenticated poster of this endpoint can never open anything.
  if (!session && withinSchoolHours() && await periodExistsForClassCode(db, code)) {
    return Response.json(
      { open: true, warmUpLink: null },
      { headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    { open: Boolean(session), warmUpLink },
    { headers: { "cache-control": "no-store" } },
  );
}
