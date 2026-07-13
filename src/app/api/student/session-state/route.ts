import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const student = await requireVerifiedStudent(request);
    const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
    if (!sessionId) throw new StudentIdentityError("The class session is missing.", 400, "session_id_missing");

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Live sessions are not configured.", 503, "sessions_not_configured");

    const { data: join, error: joinError } = await db
      .from("session_joins")
      .select("id")
      .eq("session_id", sessionId)
      .eq("student_id", student.id)
      .maybeSingle();
    if (joinError) throw new StudentIdentityError("Your class join could not be checked.", 500, "join_lookup_failed");
    if (!join) throw new StudentIdentityError("Join this class before loading its lesson.", 403, "session_join_required");

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,period_id,status,broadcast,live_flow,abbie")
      .eq("id", sessionId)
      .eq("period_id", student.periodId)
      .maybeSingle();
    if (sessionError) throw new StudentIdentityError("The class session could not be loaded.", 500, "session_lookup_failed");
    if (!session) throw new StudentIdentityError("This session belongs to a different class.", 403, "wrong_period");

    const { data: poll, error: pollError } = await db
      .from("polls")
      .select("id,question,choices,kind,status,created_at")
      .eq("session_id", sessionId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pollError) throw new StudentIdentityError("The live question could not be loaded.", 500, "poll_lookup_failed");

    return Response.json(
      { session, poll: poll ?? null },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
