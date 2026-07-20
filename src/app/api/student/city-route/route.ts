// Student Chromebook: fetch YOUR city card after routes release.
//
// GET /api/student/city-route?sessionId=...            (secure rollout)
// GET /api/student/city-route?sessionId=...&studentId=...&name=...   (transitional)
//
// Lives under /api/student because src/proxy.ts teacher-gates /api/session/*
// once NEXT_PUBLIC_SECURE_STUDENT_DATA is on. Dual-mode like
// /api/student/session-state: in secure mode identity comes from
// requireVerifiedStudent (unforgeable); in transitional mode the claimed
// studentId/name is accepted at this server boundary, matching how poll
// answers are keyed.
//
// The response is ONLY the student-safe card: city, physical destination,
// required materials, and first action. The route id, its instructional
// meaning, the readiness evidence, and every other student's assignment
// never leave the server - by design this reveals nothing beyond what the
// room itself shows once students stand up and move.
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireVerifiedStudent,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";
import type { CityStop } from "@/lib/cityRoutes";

export const dynamic = "force-dynamic";
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { headers: { "cache-control": "no-store" } };

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId") || "";
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new StudentIdentityError("The class session is missing.", 400, "session_id_missing");
    }

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("City Routes are not configured.", 503, "routes_not_configured");

    let keys: string[];
    if (process.env.NEXT_PUBLIC_SECURE_STUDENT_DATA === "true") {
      const student = await requireVerifiedStudent(request);
      keys = [student.id];
    } else {
      const studentId = url.searchParams.get("studentId");
      const name = url.searchParams.get("name");
      keys = [studentId, name ? `name:${name}` : null].filter((k): k is string => Boolean(k));
      if (!keys.length) {
        throw new StudentIdentityError("studentId or name required.", 400, "student_identity_missing");
      }
    }

    const { data: runRows, error: runError } = await db
      .from("city_route_runs")
      .select("id,cities,status,released_at")
      .eq("session_id", sessionId)
      .eq("status", "released")
      .order("released_at", { ascending: false })
      .limit(1);
    if (runError) throw new StudentIdentityError("Your route could not be loaded.", 500, "route_run_lookup_failed");
    const run = runRows?.[0];
    if (!run) return Response.json({ status: "pending" }, NO_STORE);

    const { data: rows, error: assignmentError } = await db
      .from("city_route_assignments")
      .select("student_key,city")
      .eq("run_id", run.id)
      .in("student_key", keys)
      .limit(1);
    if (assignmentError) throw new StudentIdentityError("Your route could not be loaded.", 500, "route_lookup_failed");
    const assignment = rows?.[0];
    if (!assignment) return Response.json({ status: "pending" }, NO_STORE);

    const stop = (run.cities as CityStop[]).find((s) => s.city === assignment.city);
    if (!stop) return Response.json({ status: "pending" }, NO_STORE);

    return Response.json(
      {
        status: "released",
        card: {
          city: stop.city,
          destination: stop.destination,
          materials: stop.materials,
          firstAction: stop.firstAction,
          releasedAt: run.released_at,
        },
      },
      NO_STORE,
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
