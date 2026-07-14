import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { DEFAULT_STATES } from "@/lib/classStates";
import { inferClassroomStage } from "@/lib/classroomPilot";
import { getLessonByCode, type LessonData } from "@/lib/notionLessons";
import {
  LIVE_FLOW_MODE,
  TEACHER_REMOTE_ACTIONS,
  liveTimerSeconds,
  type LiveClassFlowSnapshot,
  type LiveFlowSequenceStep,
  type TeacherRemoteAction,
  type TeacherRemoteCommand,
} from "@/lib/liveClassFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<string>(TEACHER_REMOTE_ACTIONS);
const DIRECT_TIMER_ACTIONS = new Set<TeacherRemoteAction>(["toggle-timer", "add-30", "subtract-30", "reset-timer"]);
const DIRECT_BOARD_ACTIONS = new Set<TeacherRemoteAction>(["show-board", "hide-board"]);

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

function stepsFromLesson(lesson: LessonData): LiveFlowSequenceStep[] {
  return lesson.steps.map((step) => {
    const state = DEFAULT_STATES.find((candidate) => candidate.id === step.stateId);
    const resourceUrl = step.linkUrl
      || (step.stateId === "warmup" ? lesson.warmUpLink : "")
      || (step.stateId === "exit" ? lesson.exitTicketLink : "")
      || "";
    return {
      stateId: step.stateId,
      label: step.title || state?.label || "Lesson state",
      description: step.studentDirections || state?.desc || "Wait for the teacher's directions.",
      color: state?.color || "#35785a",
      semantic: inferClassroomStage(step.stateId, step.title || state?.label || ""),
      durationSeconds: Math.max(60, step.duration * 60),
      question: step.question || "",
      pollKind: step.pollKind || null,
      choices: step.choices || [],
      correctAnswer: step.correctAnswer || "",
      standard: step.standard || "",
      resourceUrl,
      paperTask: step.paperTask || "",
      notionStepId: step.id || null,
      notionLessonId: lesson.id || null,
      lessonCode: lesson.lessonCode || "",
    };
  });
}

async function flowSteps(flow: LiveClassFlowSnapshot): Promise<LiveFlowSequenceStep[]> {
  if (flow.sequence?.steps?.length) return flow.sequence.steps;
  const lessonCode = flow.lesson?.code?.trim() || "";
  if (!lessonCode) throw new Error("Reload this lesson from Notion before using the Remote.");
  const lesson = await getLessonByCode(lessonCode);
  if (!lesson?.steps.length) throw new Error(`No timed lesson steps were found for ${lessonCode}.`);
  return stepsFromLesson(lesson);
}

async function navigateFlow(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  session: RemoteSessionRow,
  action: "next" | "previous",
): Promise<LiveClassFlowSnapshot> {
  const flow = session.live_flow;
  if (!flow?.sequence) throw new Error("Load a lesson before advancing the Remote.");
  const steps = await flowSteps(flow);
  const direction = action === "next" ? 1 : -1;
  const targetIndex = flow.sequence.currentIndex + direction;
  const step = steps[targetIndex];
  if (!step) throw new Error(action === "next" ? "This is the last lesson state." : "This is the first lesson state.");

  const closePoll = await db.from("polls").update({ status: "closed" }).eq("session_id", session.id).eq("status", "open");
  if (closePoll.error) throw new Error(closePoll.error.message);

  let poll: LiveClassFlowSnapshot["poll"] = null;
  if (step.question && step.pollKind) {
    const choices = step.pollKind === "fist-to-five" ? ["0", "1", "2", "3", "4", "5"] : step.choices;
    const inserted = await db
      .from("polls")
      .insert({
        session_id: session.id,
        question: step.question,
        choices: choices.length ? choices : null,
        kind: step.pollKind,
        status: "open",
        correct_answer: step.correctAnswer || null,
        lesson_code: step.lessonCode || null,
        notion_lesson_id: step.notionLessonId,
        notion_step_id: step.notionStepId,
        standard_id: step.standard || null,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "The response check could not open.");
    poll = {
      id: inserted.data.id,
      kind: step.pollKind,
      question: step.question,
      choices: choices.length ? choices : null,
      stage: "responding",
    };
  }

  const resource = step.resourceUrl
    ? { label: step.stateId === "exit" ? "Open Exit Ticket" : "Open Lesson Resource", url: step.resourceUrl }
    : null;
  const body = step.stateId === "independent" || step.stateId === "closeout"
    ? step.paperTask || step.question || step.description
    : step.question || step.description || step.paperTask;
  const nextStep = steps[targetIndex + 1] || null;
  const mode = resource
    ? "resource" as const
    : poll
      ? "poll" as const
      : step.stateId === "i-do" || step.stateId === "manip" || step.stateId === "we-do"
        ? "board" as const
        : "directions" as const;

  return {
    ...flow,
    updatedAt: new Date().toISOString(),
    state: {
      id: step.stateId,
      label: step.label,
      description: step.description,
      color: step.color,
      semantic: step.semantic,
    },
    phase: null,
    timer: {
      totalSeconds: step.durationSeconds,
      secondsLeft: step.durationSeconds,
      running: false,
      finished: false,
      endsAt: null,
    },
    poll,
    resource,
    presentation: {
      title: step.label,
      body,
      mode,
      notionStepId: step.notionStepId,
      boardOpen: false,
    },
    tool: null,
    sequence: {
      currentIndex: targetIndex,
      totalSteps: steps.length,
      nextLabel: nextStep?.label || null,
      nextDirections: nextStep?.description || null,
      advanceMode: "manual",
      steps,
    },
    paper: step.paperTask ? { task: step.paperTask } : null,
  };
}

function updateTimer(flow: LiveClassFlowSnapshot, action: TeacherRemoteAction): LiveClassFlowSnapshot {
  if (!flow.timer) throw new Error("The current lesson state has no timer.");
  const now = Date.now();
  const totalSeconds = Math.max(0, flow.timer.totalSeconds);
  let secondsLeft = liveTimerSeconds(flow.timer, now);
  let running = flow.timer.running;
  let finished = flow.timer.finished;
  let endsAt: string | null = flow.timer.endsAt || null;

  if (action === "toggle-timer") {
    if (running) {
      running = false;
      finished = secondsLeft <= 0;
      endsAt = null;
    } else {
      if (secondsLeft <= 0) secondsLeft = totalSeconds;
      running = secondsLeft > 0;
      finished = false;
      endsAt = running ? new Date(now + secondsLeft * 1000).toISOString() : null;
    }
  } else if (action === "reset-timer") {
    secondsLeft = totalSeconds;
    running = false;
    finished = false;
    endsAt = null;
  } else {
    const delta = action === "add-30" ? 30 : -30;
    secondsLeft = Math.max(0, secondsLeft + delta);
    finished = secondsLeft <= 0;
    if (finished) running = false;
    endsAt = running ? new Date(now + secondsLeft * 1000).toISOString() : null;
  }

  return {
    ...flow,
    updatedAt: new Date(now).toISOString(),
    timer: { totalSeconds, secondsLeft, running, finished, endsAt },
  };
}

function updateBoard(flow: LiveClassFlowSnapshot, open: boolean): LiveClassFlowSnapshot {
  if (!flow.presentation) throw new Error("Load a lesson state before opening the work space.");
  return {
    ...flow,
    updatedAt: new Date().toISOString(),
    presentation: { ...flow.presentation, boardOpen: open },
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
  const action = command.action;
  let liveFlow = session.live_flow;
  let handledDirectly = false;
  try {
    if (action === "next" || action === "previous") {
      liveFlow = await navigateFlow(result.db, session, action);
      handledDirectly = true;
    } else if (DIRECT_TIMER_ACTIONS.has(action)) {
      if (!liveFlow) throw new Error("Load a lesson before controlling its timer.");
      liveFlow = updateTimer(liveFlow, action);
      handledDirectly = true;
    } else if (DIRECT_BOARD_ACTIONS.has(action)) {
      if (!liveFlow) throw new Error("Load a lesson before opening the work space.");
      liveFlow = updateBoard(liveFlow, action === "show-board");
      handledDirectly = true;
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The Remote command could not be applied." }, { status: 409 });
  }

  if (handledDirectly) command.receivedAt = new Date().toISOString();
  const patch = handledDirectly
    ? { remote_command: command, live_flow: liveFlow }
    : { remote_command: command };
  const { error } = await result.db.from("sessions").update(patch).eq("id", session.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, command, liveFlow: handledDirectly ? liveFlow : undefined });
}
