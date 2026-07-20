// Public (student Chromebook): fetch YOUR city card after routes release.
//
// GET /api/session/city-route?sessionId=...&studentId=...&name=...
//
// Returns ONLY the student-safe card: city, physical destination, required
// materials, and first action. The route id, its instructional meaning, the
// readiness evidence, and every other student's assignment never leave the
// server - by design, this response is safe even if a student guesses
// another student's id (it reveals nothing beyond what the room itself
// shows once students stand up and move).
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { CityStop } from "@/lib/cityRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const studentId = url.searchParams.get("studentId");
  const name = url.searchParams.get("name");
  if (!sessionId) return Response.json({ error: "sessionId required" }, { status: 400 });
  if (!studentId && !name) return Response.json({ error: "studentId or name required" }, { status: 400 });

  const { data: runRows, error: runError } = await db
    .from("city_route_runs")
    .select("id,cities,status,released_at")
    .eq("session_id", sessionId)
    .eq("status", "released")
    .order("released_at", { ascending: false })
    .limit(1);
  if (runError) return Response.json({ error: runError.message }, { status: 500 });
  const run = runRows?.[0];
  if (!run) return Response.json({ status: "pending" });

  const keys = [studentId, name ? `name:${name}` : null].filter((k): k is string => Boolean(k));
  const { data: rows, error: aErr } = await db
    .from("city_route_assignments")
    .select("student_key,city")
    .eq("run_id", run.id)
    .in("student_key", keys)
    .limit(1);
  if (aErr) return Response.json({ error: aErr.message }, { status: 500 });
  const assignment = rows?.[0];
  if (!assignment) return Response.json({ status: "pending" });

  const stop = (run.cities as CityStop[]).find((s) => s.city === assignment.city);
  if (!stop) return Response.json({ status: "pending" });

  return Response.json({
    status: "released",
    card: {
      city: stop.city,
      destination: stop.destination,
      materials: stop.materials,
      firstAction: stop.firstAction,
      releasedAt: run.released_at,
    },
  });
}
