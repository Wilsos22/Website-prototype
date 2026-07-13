import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
const supabaseUrl = process.env.BDM_SUPABASE_URL;
const publishableKey = process.env.BDM_SUPABASE_PUBLISHABLE_KEY;

function required(value, name) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function decodeJson(name) {
  const value = required(process.env[name], name);
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function clientOptions() {
  return { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
}

async function createUsers() {
  required(supabaseUrl, "BDM_SUPABASE_URL");
  required(publishableKey, "BDM_SUPABASE_PUBLISHABLE_KEY");
  const marker = required(process.env.BDM_TEST_MARKER, "BDM_TEST_MARKER");
  const count = Number(process.env.BDM_TEST_CLIENTS || "40");
  const users = [];

  for (let start = 0; start < count; start += 5) {
    const batch = Array.from({ length: Math.min(5, count - start) }, (_, offset) => start + offset);
    const created = await Promise.all(batch.map(async (index) => {
      const client = createClient(supabaseUrl, publishableKey, clientOptions());
      const { data, error } = await client.auth.signInAnonymously({
        options: { data: { bdm_test_marker: marker, bdm_test_index: index } },
      });
      if (error || !data.user || !data.session?.access_token) {
        throw new Error(`Anonymous sign-in ${index} failed: ${error?.message || "missing session"}`);
      }
      return { index, authUserId: data.user.id, accessToken: data.session.access_token };
    }));
    users.push(...created);
  }

  process.stdout.write(JSON.stringify({ marker, users }));
}

function findCookie(headers) {
  const raw = headers.get("set-cookie") || "";
  return raw.split(",").map((part) => part.trim().split(";")[0]).filter(Boolean).join("; ");
}

async function vercelCookie(shareUrl) {
  if (!shareUrl) return "";
  const response = await fetch(shareUrl, { redirect: "manual" });
  const cookie = findCookie(response.headers);
  if (!cookie) throw new Error(`Vercel preview access did not set a cookie (status ${response.status})`);
  return cookie;
}

async function runLoad() {
  required(supabaseUrl, "BDM_SUPABASE_URL");
  required(publishableKey, "BDM_SUPABASE_PUBLISHABLE_KEY");
  const fixture = decodeJson("BDM_TEST_FIXTURE");
  const baseUrl = required(process.env.BDM_TEST_BASE_URL, "BDM_TEST_BASE_URL").replace(/\/$/, "");
  const previewCookie = await vercelCookie(process.env.BDM_VERCEL_SHARE_URL || "");
  const failures = [];
  const timings = {};

  async function api(user, path, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set("authorization", `Bearer ${user.accessToken}`);
    headers.set("content-type", "application/json");
    headers.set("origin", baseUrl);
    if (previewCookie) headers.set("cookie", previewCookie);
    const started = performance.now();
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers, redirect: "manual" });
    const elapsed = performance.now() - started;
    const payload = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
    return { status: response.status, payload, elapsed };
  }

  function expect(result, status, label, index) {
    if (result.status !== status) failures.push({ label, index, expected: status, actual: result.status, code: result.payload?.code || null });
  }

  async function phase(name, worker) {
    const started = performance.now();
    const results = await Promise.all(fixture.users.map(worker));
    timings[name] = {
      totalMs: Math.round(performance.now() - started),
      maxRequestMs: Math.round(Math.max(...results.map((result) => result.elapsed || 0))),
      averageRequestMs: Math.round(results.reduce((sum, result) => sum + (result.elapsed || 0), 0) / results.length),
    };
    return results;
  }

  const claims = await phase("claim", async (user) => {
    const result = await api(user, "/api/student/claim", { method: "POST", body: "{}" });
    expect(result, 200, "claim", user.index);
    if (result.status === 200 && result.payload?.student?.name !== `Load Test Student ${String(user.index + 1).padStart(2, "0")}`) {
      failures.push({ label: "claim_identity_mismatch", index: user.index });
    }
    user.studentId = result.payload?.student?.id || null;
    return result;
  });

  const wrongPeriod = await api(fixture.users[0], "/api/student/join", {
    method: "POST",
    body: JSON.stringify({ code: fixture.wrongPeriodJoinCode }),
  });
  expect(wrongPeriod, 403, "wrong_period_join", 0);
  if (wrongPeriod.payload?.code !== "wrong_period") failures.push({ label: "wrong_period_code", index: 0, code: wrongPeriod.payload?.code || null });

  const closedSession = await api(fixture.users[0], "/api/student/join", {
    method: "POST",
    body: JSON.stringify({ code: fixture.closedJoinCode }),
  });
  expect(closedSession, 404, "closed_session_join", 0);

  await phase("join", async (user) => {
    const result = await api(user, "/api/student/join", { method: "POST", body: JSON.stringify({ code: fixture.joinCode }) });
    expect(result, 200, "join", user.index);
    return result;
  });

  const states = await phase("session_state", async (user) => {
    const result = await api(user, `/api/student/session-state?sessionId=${encodeURIComponent(fixture.sessionId)}`);
    expect(result, 200, "session_state", user.index);
    const body = JSON.stringify(result.payload || {});
    if (body.includes(fixture.answerKey) || /correct_answer|correctAnswer/.test(body)) {
      failures.push({ label: "answer_key_leak", index: user.index });
    }
    return result;
  });

  await phase("poll_answer", async (user) => {
    const result = await api(user, "/api/student/poll-answer", {
      method: "POST",
      body: JSON.stringify({ pollId: fixture.pollId, answer: `reasoned answer ${user.index}` }),
    });
    expect(result, 200, "poll_answer", user.index);
    return result;
  });

  await phase("tool_evidence", async (user) => {
    const result = await api(user, "/api/student/tool-evidence", {
      method: "POST",
      body: JSON.stringify({
        sessionId: fixture.sessionId,
        tool: "equation-builder",
        correct: user.index % 4 !== 0,
        standardId: "6.RP.A.1",
        problemId: `${fixture.marker}-${user.index}`,
        misconception: user.index % 4 === 0 ? "load-test misconception" : null,
      }),
    });
    expect(result, 200, "tool_evidence", user.index);
    return result;
  });

  await phase("checkpoint_get", async (user) => {
    const result = await api(user, `/api/student/checkpoint?sessionId=${encodeURIComponent(fixture.sessionId)}`);
    expect(result, 200, "checkpoint_get", user.index);
    const body = JSON.stringify(result.payload || {});
    if (body.includes(fixture.answerKey) || /correct_answer|correctAnswer/.test(body)) failures.push({ label: "checkpoint_answer_key_leak", index: user.index });
    return result;
  });

  await phase("checkpoint_post", async (user) => {
    const result = await api(user, "/api/student/checkpoint", {
      method: "POST",
      body: JSON.stringify({ runId: fixture.checkpointId, sessionId: fixture.sessionId, answer: user.index % 2 === 0 ? "6" : "5" }),
    });
    expect(result, 200, "checkpoint_post", user.index);
    return result;
  });

  await phase("exit_ticket_get", async (user) => {
    const result = await api(user, `/api/student/exit-ticket?sessionId=${encodeURIComponent(fixture.sessionId)}`);
    expect(result, 200, "exit_ticket_get", user.index);
    return result;
  });

  await phase("exit_ticket_post", async (user) => {
    const result = await api(user, "/api/student/exit-ticket", {
      method: "POST",
      body: JSON.stringify({ exitTicketId: fixture.exitTicketId, sessionId: fixture.sessionId, response: `exit response ${user.index}` }),
    });
    expect(result, 200, "exit_ticket_post", user.index);
    return result;
  });

  await phase("practice_get", async (user) => {
    const result = await api(user, `/api/student/practice-attempt?assignmentId=${encodeURIComponent(fixture.practiceAssignmentId)}`);
    expect(result, 200, "practice_get", user.index);
    return result;
  });

  await phase("practice_post", async (user) => {
    const result = await api(user, "/api/student/practice-attempt", {
      method: "POST",
      body: JSON.stringify({
        assignmentId: fixture.practiceAssignmentId,
        prompt: "3 × 4",
        correctAnswer: "12",
        answer: user.index % 3 === 0 ? "11" : "12",
        timeMs: 1200 + user.index,
        roundIndex: 1,
      }),
    });
    expect(result, 200, "practice_post", user.index);
    return result;
  });

  async function rest(user, table, select = "*") {
    const headers = {
      apikey: publishableKey,
      authorization: `Bearer ${user.accessToken}`,
      accept: "application/json",
    };
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}`, { headers });
    const payload = await response.json().catch(() => null);
    return { status: response.status, payload };
  }

  for (const user of fixture.users.slice(0, 2)) {
    const ownTables = ["students", "session_joins", "poll_answers", "checkpoint_results", "exit_ticket_responses", "practice_assignment_attempts", "responses"];
    for (const table of ownTables) {
      const result = await rest(user, table, "student_id,id");
      if (table === "students") {
        const selfResult = await rest(user, table, "id");
        if (selfResult.status === 200 && (selfResult.payload?.length !== 1 || selfResult.payload[0]?.id !== user.studentId)) {
          failures.push({ label: `rls_${table}_cross_student`, index: user.index, rows: selfResult.payload?.length ?? null });
        } else if (selfResult.status !== 200 && selfResult.status !== 403) {
          failures.push({ label: `rls_${table}_unexpected_status`, index: user.index, actual: selfResult.status });
        }
        continue;
      }
      if (result.status === 200 && Array.isArray(result.payload) && result.payload.some((row) => row.student_id !== user.studentId)) {
        failures.push({ label: `rls_${table}_cross_student`, index: user.index });
      } else if (result.status !== 200 && result.status !== 403) {
        failures.push({ label: `rls_${table}_unexpected_status`, index: user.index, actual: result.status });
      }
    }
  }

  const unauthenticated = await fetch(`${supabaseUrl}/rest/v1/students?select=id`, {
    headers: { apikey: publishableKey, authorization: `Bearer ${publishableKey}` },
  });
  if (![200, 401, 403].includes(unauthenticated.status)) failures.push({ label: "anonymous_students_unexpected_status", actual: unauthenticated.status });
  if (unauthenticated.status === 200) {
    const rows = await unauthenticated.json().catch(() => []);
    if (rows.length !== 0) failures.push({ label: "anonymous_students_visible", rows: rows.length });
  }

  const teacherHeaders = previewCookie ? { cookie: previewCookie } : {};
  const teacherResponse = await fetch(`${baseUrl}/api/teacher/roster`, { headers: teacherHeaders, redirect: "manual" });
  if (teacherResponse.status !== 401) failures.push({ label: "teacher_api_without_cookie", expected: 401, actual: teacherResponse.status });

  const teacherPassword = required(process.env.BDM_TEACHER_PASSWORD, "BDM_TEACHER_PASSWORD");
  const authorizedTeacherHeaders = {
    ...teacherHeaders,
    authorization: `Basic ${Buffer.from(`teacher:${teacherPassword}`).toString("base64")}`,
  };
  const teacherReviews = await Promise.all([
    fetch(`${baseUrl}/api/teacher/poll?pollId=${encodeURIComponent(fixture.pollId)}`, { headers: authorizedTeacherHeaders }),
    fetch(`${baseUrl}/api/teacher/checkpoint?runId=${encodeURIComponent(fixture.checkpointId)}`, { headers: authorizedTeacherHeaders }),
    fetch(`${baseUrl}/api/teacher/exit-ticket?ticketId=${encodeURIComponent(fixture.exitTicketId)}`, { headers: authorizedTeacherHeaders }),
    fetch(`${baseUrl}/api/teacher/practice-assignment?assignmentId=${encodeURIComponent(fixture.practiceAssignmentId)}`, { headers: authorizedTeacherHeaders }),
  ]);
  const teacherReviewCounts = [];
  for (const [index, response] of teacherReviews.entries()) {
    const payload = await response.json().catch(() => ({}));
    if (response.status !== 200) failures.push({ label: "teacher_review_status", index, expected: 200, actual: response.status });
    const count = Array.isArray(payload.answers) ? payload.answers.length
      : Array.isArray(payload.results) ? payload.results.length
      : Array.isArray(payload.responses) ? payload.responses.length
      : Array.isArray(payload.results?.students) ? payload.results.students.length
      : Array.isArray(payload.results?.rows) ? payload.results.rows.length
      : Number(payload.results?.attempts || 0);
    teacherReviewCounts.push(count);
    if (response.status === 200 && count !== fixture.users.length) {
      failures.push({ label: "teacher_review_count", index, expected: fixture.users.length, actual: count });
    }
  }

  process.stdout.write(JSON.stringify({
    passed: failures.length === 0,
    clients: fixture.users.length,
    failures,
    timings,
    checks: {
      claims: claims.length,
      states: states.length,
      wrongPeriodStatus: wrongPeriod.status,
      closedSessionStatus: closedSession.status,
      teacherUnauthenticatedStatus: teacherResponse.status,
      teacherReviewCounts,
    },
  }));
}

if (mode === "create-users") await createUsers();
else if (mode === "run") await runLoad();
else throw new Error("Use create-users or run");
