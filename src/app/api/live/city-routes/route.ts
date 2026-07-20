// Teacher-only (middleware): City Routes review, override, and release.
//
// GET  /api/live/city-routes?sessionId=...   -> full private state
// POST /api/live/city-routes                 -> {action: prepare|refresh|shuffle|override|release, ...}
//
// Readiness evidence is read straight from the session's own polls: the live
// flow snapshot in sessions.live_flow names each readiness question and its
// correct answer, the polls table holds the session's deployed questions, and
// poll_answers holds what each student chose. Nothing here is ever written
// into live_flow, so the student broadcast path stays untouched.
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  CITY_ROUTE_IDS,
  recommendRoute,
  rotateCities,
  stopForRoute,
  type CityRouteId,
  type CityRouteRecommendation,
  type CityStop,
  type ReadinessEvidence,
} from "@/lib/cityRoutes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Db = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

interface StepLite {
  stateId?: string;
  question?: string;
  correctAnswer?: string;
  pollKind?: string | null;
  lessonCode?: string;
}

interface RunRow {
  id: string;
  session_id: string;
  lesson_code: string;
  salt: number;
  cities: CityStop[];
  status: string;
  released_at: string | null;
}

interface AssignmentRow {
  run_id: string;
  student_key: string;
  display_name: string;
  route: CityRouteId;
  city: string;
  source: string;
  low_confidence: boolean;
}

function studentKeyOf(studentId: string | null, displayName: string | null): string {
  return studentId || `name:${displayName || "student"}`;
}

async function loadState(db: Db, sessionId: string) {
  const { data: session, error: sessionError } = await db
    .from("sessions")
    .select("id, live_flow")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error("Session not found.");

  const steps: StepLite[] = session.live_flow?.sequence?.steps || [];
  const lessonCode = steps.find((s) => s.lessonCode)?.lessonCode || "";
  const questionSteps = steps.filter(
    (s) => s.stateId === "question" && s.question && s.correctAnswer,
  );
  const fistStep = [...steps].reverse().find((s) => s.pollKind === "fist-to-five" && s.question) || null;

  const [{ data: polls }, { data: joins }] = await Promise.all([
    db.from("polls").select("id,question,kind,created_at").eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
    db.from("session_joins").select("student_id,display_name,joined_at").eq("session_id", sessionId)
      .order("joined_at", { ascending: true }),
  ]);

  // Latest poll per (kind, question) - a re-opened question supersedes.
  const pollByQuestion = new Map<string, string>();
  for (const p of polls || []) pollByQuestion.set(`${p.kind}|${p.question}`, p.id);
  const questionPollIds = questionSteps.map(
    (s) => pollByQuestion.get(`multiple-choice|${s.question}`) || null,
  );
  const fistPollId = fistStep ? pollByQuestion.get(`fist-to-five|${fistStep.question}`) || null : null;

  const pollIds = [...questionPollIds, fistPollId].filter((id): id is string => Boolean(id));
  const { data: answers } = pollIds.length
    ? await db.from("poll_answers").select("poll_id,student_id,display_name,answer,created_at")
        .in("poll_id", pollIds).order("created_at", { ascending: true })
    : { data: [] as { poll_id: string; student_id: string | null; display_name: string | null; answer: string | null }[] };

  // Latest answer per poll per student.
  const latestAnswer = new Map<string, string>();
  for (const a of answers || []) {
    if (a.answer == null) continue;
    latestAnswer.set(`${a.poll_id}|${studentKeyOf(a.student_id, a.display_name)}`, a.answer);
  }

  // Roster = everyone who joined this session (latest name wins).
  const roster = new Map<string, string>();
  for (const j of joins || []) {
    roster.set(studentKeyOf(j.student_id, j.display_name), j.display_name || "Student");
  }

  const evidence: ReadinessEvidence[] = [...roster.entries()].map(([studentKey, name]) => {
    const correct = questionSteps.map((step, i) => {
      const pollId = questionPollIds[i];
      if (!pollId) return null;
      const answer = latestAnswer.get(`${pollId}|${studentKey}`);
      if (answer === undefined) return null;
      return answer === step.correctAnswer;
    });
    const fistRaw = fistPollId ? latestAnswer.get(`${fistPollId}|${studentKey}`) : undefined;
    const fistParsed = fistRaw !== undefined ? Number.parseInt(fistRaw, 10) : Number.NaN;
    const fist = Number.isInteger(fistParsed) && fistParsed >= 0 && fistParsed <= 5 ? fistParsed : null;
    return { studentKey, name, correct, fist };
  });

  const recommendations = new Map<string, CityRouteRecommendation>(
    evidence.map((e) => [e.studentKey, recommendRoute(e)]),
  );

  const { data: runRows } = await db
    .from("city_route_runs")
    .select("id,session_id,lesson_code,salt,cities,status,released_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1);
  const run = (runRows?.[0] as RunRow | undefined) || null;

  const assignmentsByKey = new Map<string, AssignmentRow>();
  if (run) {
    const { data: rows } = await db
      .from("city_route_assignments")
      .select("run_id,student_key,display_name,route,city,source,low_confidence")
      .eq("run_id", run.id);
    for (const row of (rows || []) as AssignmentRow[]) assignmentsByKey.set(row.student_key, row);
  }

  const students = evidence
    .map((e) => {
      const rec = recommendations.get(e.studentKey)!;
      const assigned = assignmentsByKey.get(e.studentKey) || null;
      return {
        studentKey: e.studentKey,
        name: e.name,
        correct: e.correct,
        fist: e.fist,
        recommended: rec.route,
        needsAssignment: rec.needsAssignment && !assigned,
        lowConfidence: assigned ? assigned.low_confidence : rec.lowConfidence,
        assignedRoute: assigned?.route || null,
        assignedCity: assigned?.city || null,
        source: assigned?.source || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return { sessionId, lessonCode, questionCount: questionSteps.length, hasFist: Boolean(fistPollId), run, students, evidence, recommendations };
}

function publicState(state: Awaited<ReturnType<typeof loadState>>) {
  const { evidence: _evidence, recommendations: _recommendations, ...rest } = state;
  return rest;
}

async function writeAutoAssignments(db: Db, run: RunRow, state: Awaited<ReturnType<typeof loadState>>) {
  const preserve = new Set<string>();
  const { data: existing } = await db
    .from("city_route_assignments")
    .select("student_key,source")
    .eq("run_id", run.id);
  for (const row of existing || []) if (row.source === "override") preserve.add(row.student_key);

  const rows = state.evidence
    .map((e) => {
      const rec = state.recommendations.get(e.studentKey)!;
      if (!rec.route || preserve.has(e.studentKey)) return null;
      const stop = stopForRoute(run.cities, rec.route);
      if (!stop) return null;
      return {
        run_id: run.id,
        student_key: e.studentKey,
        display_name: e.name,
        route: rec.route,
        city: stop.city,
        source: "auto",
        low_confidence: rec.lowConfidence,
        evidence: { correct: e.correct, fist: e.fist },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length) {
    const { error } = await db
      .from("city_route_assignments")
      .upsert(rows, { onConflict: "run_id,student_key" });
    if (error) throw new Error(error.message);
  }
}

export async function GET(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) return Response.json({ error: "sessionId required" }, { status: 400 });

  try {
    return Response.json(publicState(await loadState(db, sessionId)));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load City Routes." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  let body: {
    action?: string;
    sessionId?: string;
    runId?: string;
    studentKey?: string;
    route?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action || "";
  const sessionId = body.sessionId || "";
  if (!sessionId) return Response.json({ error: "sessionId required" }, { status: 400 });

  try {
    const state = await loadState(db, sessionId);

    if (action === "prepare") {
      // Idempotent: an existing draft run is refreshed, not duplicated. A new
      // run is created only when there is no run yet or the last one was
      // already released (a re-run of the block).
      let run = state.run;
      if (!run || run.status === "released") {
        const cities = rotateCities(state.lessonCode, 0);
        const { data, error } = await db
          .from("city_route_runs")
          .insert({ session_id: sessionId, lesson_code: state.lessonCode, salt: 0, cities, status: "draft" })
          .select("id,session_id,lesson_code,salt,cities,status,released_at")
          .single();
        if (error) throw new Error(error.message);
        run = data as RunRow;
      }
      await writeAutoAssignments(db, run, state);
      return Response.json(publicState(await loadState(db, sessionId)));
    }

    const run = state.run;
    if (!run) return Response.json({ error: "No run prepared yet." }, { status: 400 });

    if (action === "refresh") {
      if (run.status !== "draft") return Response.json({ error: "Run already released." }, { status: 400 });
      await writeAutoAssignments(db, run, state);
    } else if (action === "shuffle") {
      if (run.status !== "draft") return Response.json({ error: "Run already released." }, { status: 400 });
      const salt = run.salt + 1;
      const cities = rotateCities(run.lesson_code, salt);
      const { error } = await db
        .from("city_route_runs")
        .update({ salt, cities, updated_at: new Date().toISOString() })
        .eq("id", run.id);
      if (error) throw new Error(error.message);
      // City follows route: reassign every student's city label under the new deal.
      const { data: rows } = await db
        .from("city_route_assignments")
        .select("student_key,route")
        .eq("run_id", run.id);
      for (const row of rows || []) {
        const stop = stopForRoute(cities, row.route as CityRouteId);
        if (!stop) continue;
        await db.from("city_route_assignments")
          .update({ city: stop.city, updated_at: new Date().toISOString() })
          .eq("run_id", run.id).eq("student_key", row.student_key);
      }
    } else if (action === "override") {
      const route = body.route as CityRouteId | undefined;
      const studentKey = body.studentKey || "";
      if (!studentKey || !route || !CITY_ROUTE_IDS.includes(route)) {
        return Response.json({ error: "studentKey and a valid route required." }, { status: 400 });
      }
      const stop = stopForRoute(run.cities, route);
      if (!stop) return Response.json({ error: "Run has no city for that route." }, { status: 500 });
      const name = state.students.find((s) => s.studentKey === studentKey)?.name || "Student";
      const { error } = await db.from("city_route_assignments").upsert(
        {
          run_id: run.id,
          student_key: studentKey,
          display_name: name,
          route,
          city: stop.city,
          source: "override",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "run_id,student_key" },
      );
      if (error) throw new Error(error.message);
    } else if (action === "release") {
      const { error } = await db
        .from("city_route_runs")
        .update({ status: "released", released_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", run.id);
      if (error) throw new Error(error.message);
    } else {
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return Response.json(publicState(await loadState(db, sessionId)));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "City Routes action failed." },
      { status: 500 },
    );
  }
}
