import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { DEFAULT_STATES } from "@/lib/classStates";
import { inferClassroomStage } from "@/lib/classroomPilot";
import { getLessonByCode, type LessonData } from "@/lib/notionLessons";
import {
  LIVE_FLOW_MODE,
  REMOTE_COMMAND_STALE_MS,
  TEACHER_REMOTE_ACTIONS,
  liveAssignedToolRoute,
  liveResponseModePollKind,
  liveTimerSeconds,
  splitLiveFlowLines,
  splitLiveFlowVocabulary,
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
const SPINNER_STATE_IDS = new Set(["learning-target-readers", "ipad-kid"]);
const REMOTE_TRANSITION_TIMEOUT_MS = 10_000;
const AUTO_ADVANCE_HOLD_MS = 2_600;
const POLL_RESULTS_HOLD_MS = 6_000;

interface RemoteSessionRow {
  id: string;
  join_code: string | null;
  remote_command: TeacherRemoteCommand | null;
  started_at: string;
  live_flow: LiveClassFlowSnapshot | null;
}

interface NavigationResult {
  liveFlow: LiveClassFlowSnapshot;
  createdPollId: string | null;
}

interface HydratedFlowContract {
  steps: LiveFlowSequenceStep[];
  lesson: LiveClassFlowSnapshot["lesson"];
}

async function openSessions(sessionId = "") {
  const db = getSupabaseAdmin();
  if (!db) return { db: null, sessions: [] as RemoteSessionRow[], error: "Database not configured." };
  let query = db
    .from("sessions")
    .select("id,join_code,remote_command,started_at,live_flow")
    .eq("status", "open")
    .eq("broadcast", LIVE_FLOW_MODE);
  query = sessionId
    ? query.eq("id", sessionId)
    : query.order("started_at", { ascending: false });
  const { data, error } = await query;
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
    const resourceUrl = (step.responseMode.trim().toLowerCase() === "assigned tool" ? liveAssignedToolRoute(step.tool) : null)
      || step.linkUrl
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
      mainDisplay: step.mainDisplay || "",
      paceDirections: step.paceDirections || state?.paceAction || step.studentDirections || state?.desc || "",
      studentAction: step.studentAction || state?.studentAction || step.studentDirections || state?.desc || "",
      discussionStems: step.stateId === "discussion"
        ? splitLiveFlowLines(step.discussionStems || lesson.discussionStems)
        : [],
      vocabulary: step.stateId === "discussion"
        ? splitLiveFlowVocabulary(step.vocabulary || lesson.discussionVocabulary)
        : [],
      responseMode: step.responseMode || "",
      workSpaceAvailable: step.workSpaceAvailable,
    };
  });
}

function lessonSnapshotFromNotion(lesson: LessonData): NonNullable<LiveClassFlowSnapshot["lesson"]> {
  return {
    id: lesson.id || null,
    code: lesson.lessonCode,
    title: lesson.title,
    learningIntention: lesson.learningIntention,
    successCriteria: lesson.successCriteria,
    selectedSuccessCriterion: lesson.selectedSuccessCriterion || lesson.successCriteria,
    classroomMode: lesson.classroomMode,
    discussionStems: splitLiveFlowLines(lesson.discussionStems),
    discussionVocabulary: splitLiveFlowVocabulary(lesson.discussionVocabulary),
    requiredPaperWork: lesson.requiredPaperWork,
    requiredDigitalWork: lesson.requiredDigitalWork,
    optionalSupport: lesson.optionalSupport,
    bigDogChallenge: lesson.bigDogChallenge,
    dueAndTurnIn: lesson.dueAndTurnIn,
    helpPath: lesson.helpPath,
  };
}

async function hydrateFlowContract(flow: LiveClassFlowSnapshot): Promise<HydratedFlowContract> {
  if (flow.version === 2 && flow.sequence?.steps?.length) {
    return { steps: flow.sequence.steps, lesson: flow.lesson };
  }
  const lessonCode = flow.lesson?.code?.trim() || "";
  if (!lessonCode && flow.sequence?.steps?.length) {
    return { steps: flow.sequence.steps, lesson: flow.lesson };
  }
  if (!lessonCode) throw new Error("Reload this lesson from Notion before using the Remote.");
  const lesson = await getLessonByCode(lessonCode);
  if (!lesson?.steps.length) throw new Error(`No timed lesson steps were found for ${lessonCode}.`);
  return { steps: stepsFromLesson(lesson), lesson: lessonSnapshotFromNotion(lesson) };
}

async function fullyHydrateFlow(flow: LiveClassFlowSnapshot): Promise<LiveClassFlowSnapshot> {
  const contract = await hydrateFlowContract(flow);
  const publicSteps = contract.steps.map(({ remoteActions: _privateRemoteActions, ...step }) => step);
  const nextPublicStep = flow.sequence ? publicSteps[flow.sequence.currentIndex + 1] : null;
  const presentation = flow.presentation
    ? (({ remoteActions: _privateRemoteActions, ...publicPresentation }) => publicPresentation)(flow.presentation)
    : null;
  return {
    ...flow,
    version: 2,
    presentation,
    lesson: contract.lesson,
    sequence: flow.sequence
      ? {
          ...flow.sequence,
          totalSteps: publicSteps.length,
          nextDirections: nextPublicStep?.paceDirections || nextPublicStep?.description || null,
          steps: publicSteps,
        }
      : flow.sequence,
  };
}

async function navigateFlow(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  session: RemoteSessionRow,
  action: "next" | "previous",
): Promise<NavigationResult> {
  const flow = session.live_flow;
  if (!flow?.sequence) throw new Error("Load a lesson before advancing the Remote.");
  const contract = await hydrateFlowContract(flow);
  const steps = contract.steps;
  const direction = action === "next" ? 1 : -1;
  const targetIndex = flow.sequence.currentIndex + direction;
  const step = steps[targetIndex];
  if (!step) throw new Error(action === "next" ? "This is the last lesson state." : "This is the first lesson state.");

  let poll: LiveClassFlowSnapshot["poll"] = null;
  const pollKind = step.responseMode?.trim()
    ? liveResponseModePollKind(step.responseMode)
    : step.pollKind;
  if (step.question && pollKind) {
    const choices = pollKind === "fist-to-five" ? ["0", "1", "2", "3", "4", "5"] : step.choices;
    const inserted = await db
      .from("polls")
      .insert({
        session_id: session.id,
        question: step.question,
        choices: choices.length ? choices : null,
        kind: pollKind,
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
      kind: pollKind,
      question: step.question,
      choices: choices.length ? choices : null,
      stage: "responding",
    };
  }

  const resource = step.resourceUrl
    ? {
        label: step.stateId === "exit"
          ? "Open Exit Ticket"
          : step.responseMode?.trim().toLowerCase() === "assigned tool"
            ? "Open Assigned Tool"
            : "Open Lesson Resource",
        url: step.resourceUrl,
      }
    : null;
  const body = step.mainDisplay || (step.stateId === "independent" || step.stateId === "closeout"
    ? step.paperTask || step.question || step.description
    : step.question || step.description || step.paperTask);
  const nextStep = steps[targetIndex + 1] || null;
  const continuePacing = flow.sequence.advanceMode === "automatic"
    && Boolean(flow.timer?.running || flow.timer?.finished || flow.poll?.stage === "results");
  const now = Date.now();
  const mode = resource
    ? "resource" as const
    : poll
      ? "poll" as const
      : step.stateId === "i-do" || step.stateId === "manip" || step.stateId === "we-do"
        ? "board" as const
        : "directions" as const;

  return {
    createdPollId: poll?.id || null,
    liveFlow: {
      ...flow,
      version: 2,
      updatedAt: new Date().toISOString(),
      lesson: contract.lesson,
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
        running: continuePacing,
        finished: false,
        endsAt: continuePacing ? new Date(now + step.durationSeconds * 1000).toISOString() : null,
      },
      poll,
      resource,
      presentation: {
        title: step.label,
        body,
        mainDisplay: step.mainDisplay || "",
        mode,
        notionStepId: step.notionStepId,
        boardOpen: false,
        paceDirections: step.paceDirections || step.description,
        studentAction: step.studentAction || step.description,
        responseMode: step.responseMode || "",
        workSpaceAvailable: step.workSpaceAvailable,
        discussionStems: step.discussionStems || [],
        vocabulary: step.vocabulary || [],
      },
      tool: null,
      sequence: {
        currentIndex: targetIndex,
        totalSteps: steps.length,
        nextLabel: nextStep?.label || null,
        nextDirections: nextStep?.paceDirections || nextStep?.description || null,
        advanceMode: flow.sequence.advanceMode,
        steps: steps.map(({ remoteActions: _privateRemoteActions, ...publicStep }) => publicStep),
      },
      paper: step.paperTask ? { task: step.paperTask } : null,
    },
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
    sequence: flow.sequence && action === "toggle-timer" && running
      ? { ...flow.sequence, advanceMode: "automatic" }
      : flow.sequence,
  };
}

function updateBoard(flow: LiveClassFlowSnapshot, open: boolean): LiveClassFlowSnapshot {
  if (!flow.presentation) throw new Error("Load a lesson state before opening the work space.");
  if (open && flow.presentation.workSpaceAvailable === false) {
    throw new Error("This lesson state does not use the side work space.");
  }
  return {
    ...flow,
    updatedAt: new Date().toISOString(),
    presentation: { ...flow.presentation, boardOpen: open },
  };
}

async function claimRemoteFlow(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  session: RemoteSessionRow,
): Promise<{ session: RemoteSessionRow; token: string }> {
  const flow = session.live_flow;
  if (!flow) throw new Error("Load a lesson before using the Remote.");
  if (flow.transition) {
    const startedAt = Date.parse(flow.transition.startedAt);
    if (Number.isFinite(startedAt) && Date.now() - startedAt < REMOTE_TRANSITION_TIMEOUT_MS) {
      throw new Error("Another Remote action is still finishing. Try again.");
    }
  }
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const claimedFlow: LiveClassFlowSnapshot = {
    ...flow,
    updatedAt: now,
    transition: { token, startedAt: now },
  };
  let update = db
    .from("sessions")
    .update({ live_flow: claimedFlow })
    .eq("id", session.id)
    .eq("status", "open");
  update = flow.updatedAt
    ? update.filter("live_flow->>updatedAt", "eq", flow.updatedAt)
    : update.is("live_flow", null);
  update = session.remote_command?.nonce
    ? update.filter("remote_command->>nonce", "eq", session.remote_command.nonce)
    : update.is("remote_command", null);
  const { data, error } = await update
    .select("id,join_code,remote_command,started_at,live_flow")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The lesson changed before this Remote action arrived. Try again.");
  return { session: data as RemoteSessionRow, token };
}

async function persistClaimedFlow(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  claimedSession: RemoteSessionRow,
  token: string,
  liveFlow: LiveClassFlowSnapshot,
  command: TeacherRemoteCommand,
): Promise<LiveClassFlowSnapshot> {
  if (claimedSession.live_flow?.transition?.token !== token) {
    throw new Error("The Remote action lost its lesson-state claim. Try again.");
  }
  const finalFlow = await fullyHydrateFlow(liveFlow);
  delete finalFlow.transition;
  let update = db
    .from("sessions")
    .update({ live_flow: finalFlow, remote_command: command })
    .eq("id", claimedSession.id)
    .eq("status", "open")
    .filter("live_flow->>updatedAt", "eq", claimedSession.live_flow.updatedAt);
  update = claimedSession.remote_command?.nonce
    ? update.filter("remote_command->>nonce", "eq", claimedSession.remote_command.nonce)
    : update.is("remote_command", null);
  const { data, error } = await update
    .select("live_flow")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.live_flow) throw new Error("The lesson changed while the Remote action was finishing. Try again.");
  return data.live_flow as LiveClassFlowSnapshot;
}

async function persistDirectFlow(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  session: RemoteSessionRow,
  liveFlow: LiveClassFlowSnapshot,
  command: TeacherRemoteCommand,
): Promise<LiveClassFlowSnapshot> {
  const currentFlow = session.live_flow;
  if (!currentFlow) throw new Error("Load a lesson before using the Remote.");
  if (currentFlow.transition) {
    const startedAt = Date.parse(currentFlow.transition.startedAt);
    if (Number.isFinite(startedAt) && Date.now() - startedAt < REMOTE_TRANSITION_TIMEOUT_MS) {
      throw new Error("Another Remote action is still finishing. Try again.");
    }
  }

  const finalFlow = await fullyHydrateFlow(liveFlow);
  delete finalFlow.transition;
  let update = db
    .from("sessions")
    .update({ live_flow: finalFlow, remote_command: command })
    .eq("id", session.id)
    .eq("status", "open");
  update = currentFlow.updatedAt
    ? update.filter("live_flow->>updatedAt", "eq", currentFlow.updatedAt)
    : update.is("live_flow", null);
  update = session.remote_command?.nonce
    ? update.filter("remote_command->>nonce", "eq", session.remote_command.nonce)
    : update.is("remote_command", null);
  const { data, error } = await update
    .select("live_flow")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.live_flow) throw new Error("The lesson changed before this Remote action arrived. Try again.");
  return data.live_flow as LiveClassFlowSnapshot;
}

async function releaseRemoteFlowClaim(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  claimedSession: RemoteSessionRow,
  token: string,
  originalFlow: LiveClassFlowSnapshot | null,
): Promise<void> {
  if (!originalFlow || claimedSession.live_flow?.transition?.token !== token) return;
  const restoredFlow = { ...originalFlow, updatedAt: new Date().toISOString() } as LiveClassFlowSnapshot;
  delete restoredFlow.transition;
  await db
    .from("sessions")
    .update({ live_flow: restoredFlow })
    .eq("id", claimedSession.id)
    .eq("status", "open")
    .filter("live_flow->>updatedAt", "eq", claimedSession.live_flow.updatedAt);
}

async function closeOpenPolls(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  sessionId: string,
  keepPollId: string | null,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let update = db
      .from("polls")
      .update({ status: "closed" })
      .eq("session_id", sessionId)
      .eq("status", "open");
    if (keepPollId) update = update.neq("id", keepPollId);
    const { error } = await update;
    if (!error) return;
  }
}

async function closePollById(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  pollId: string | null,
): Promise<void> {
  if (!pollId) return;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await db.from("polls").update({ status: "closed" }).eq("id", pollId).eq("status", "open");
    if (!error) return;
  }
}

async function reloadRemoteSession(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  sessionId: string,
): Promise<RemoteSessionRow | null> {
  const { data } = await db
    .from("sessions")
    .select("id,join_code,remote_command,started_at,live_flow")
    .eq("id", sessionId)
    .eq("status", "open")
    .eq("broadcast", LIVE_FLOW_MODE)
    .maybeSingle();
  return data ? data as RemoteSessionRow : null;
}

function automaticTransitionDue(flow: LiveClassFlowSnapshot, now: number): "results" | "next" | null {
  const sequence = flow.sequence;
  if (!sequence || sequence.advanceMode !== "automatic") return null;
  if (flow.transition) return null;
  const hasNext = sequence.currentIndex + 1 < sequence.totalSteps;

  if (flow.poll?.stage === "results") {
    if (!hasNext) return null;
    const resultsStartedAt = Date.parse(flow.updatedAt);
    return Number.isFinite(resultsStartedAt) && now - resultsStartedAt >= POLL_RESULTS_HOLD_MS ? "next" : null;
  }

  const timer = flow.timer;
  if (!timer || liveTimerSeconds(timer, now) > 0 || (!timer.running && !timer.finished)) return null;
  const parsedEndsAt = timer.endsAt ? Date.parse(timer.endsAt) : Number.NaN;
  const parsedUpdatedAt = Date.parse(flow.updatedAt);
  const finishedAt = Number.isFinite(parsedEndsAt) ? parsedEndsAt : parsedUpdatedAt;
  if (!Number.isFinite(finishedAt)) return null;
  if (flow.poll?.stage === "responding") return now >= finishedAt ? "results" : null;
  if (!hasNext) return null;
  return now - finishedAt >= AUTO_ADVANCE_HOLD_MS ? "next" : null;
}

async function applyLazyAutomaticTransition(
  db: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  session: RemoteSessionRow,
): Promise<RemoteSessionRow> {
  const flow = session.live_flow;
  if (!flow || (session.remote_command && !session.remote_command.receivedAt)) return session;
  const transition = automaticTransitionDue(flow, Date.now());
  if (!transition) return session;

  let claimedSession: RemoteSessionRow | null = null;
  let claimToken: string | null = null;
  let createdPollId: string | null = null;
  try {
    const claim = await claimRemoteFlow(db, session);
    claimedSession = claim.session;
    claimToken = claim.token;
    const now = new Date().toISOString();
    const command: TeacherRemoteCommand = {
      nonce: crypto.randomUUID(),
      action: transition === "next" ? "next" : "toggle-timer",
      issuedAt: now,
      receivedAt: now,
    };
    let nextFlow: LiveClassFlowSnapshot;
    if (transition === "results") {
      const claimedFlow = claimedSession.live_flow;
      if (!claimedFlow?.poll || claimedFlow.poll.stage !== "responding") throw new Error("The response check already changed.");
      nextFlow = {
        ...claimedFlow,
        updatedAt: now,
        timer: null,
        poll: { ...claimedFlow.poll, stage: "results" },
      };
    } else {
      const navigation = await navigateFlow(db, claimedSession, "next");
      nextFlow = navigation.liveFlow;
      createdPollId = navigation.createdPollId;
    }

    const persistedFlow = await persistClaimedFlow(db, claimedSession, claimToken, nextFlow, command);
    await closeOpenPolls(db, session.id, persistedFlow.poll?.id || null);
    return { ...claimedSession, live_flow: persistedFlow, remote_command: command };
  } catch {
    await closePollById(db, createdPollId);
    if (claimedSession && claimToken) await releaseRemoteFlowClaim(db, claimedSession, claimToken, session.live_flow);
    return await reloadRemoteSession(db, session.id) || session;
  }
}

export async function GET(request: Request) {
  const requestedSessionId = new URL(request.url).searchParams.get("sessionId") || "";
  const result = await openSessions(requestedSessionId);
  if (!result.db) return Response.json({ connected: false, error: result.error }, { status: 503 });
  if (result.error) return Response.json({ connected: false, error: result.error }, { status: 500 });
  let requestedSession = requestedSessionId
    ? result.sessions.find((session) => session.id === requestedSessionId) ?? null
    : null;
  if (requestedSession) requestedSession = await applyLazyAutomaticTransition(result.db, requestedSession);
  return Response.json({
    connected: true,
    session: requestedSession ? serializeSession(requestedSession) : null,
    sessions: result.sessions.map(serializeSession),
  });
}

export async function POST(request: Request) {
  let body: { action?: string; sessionId?: string; expectedStateId?: string; expectedSequenceIndex?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) return Response.json({ error: "Confirm a class session before sending a command." }, { status: 400 });
  if (!body.action || !ACTIONS.has(body.action as TeacherRemoteAction)) {
    return Response.json({ error: "Unknown remote action." }, { status: 400 });
  }
  const result = await openSessions(sessionId);
  if (!result.db) return Response.json({ error: result.error }, { status: 503 });
  if (result.error) return Response.json({ error: result.error }, { status: 500 });
  const session = result.sessions.find((candidate) => candidate.id === sessionId) ?? null;
  if (!session) return Response.json({ error: "The selected Live Class Flow session is not open." }, { status: 404 });
  const action = body.action as TeacherRemoteAction;
  let spinnerStateId: string | null = null;
  if (action === "spin-spinner") {
    const expectedStateId = typeof body.expectedStateId === "string" ? body.expectedStateId.trim() : "";
    const expectedSequenceIndex = typeof body.expectedSequenceIndex === "number" && Number.isInteger(body.expectedSequenceIndex)
      ? body.expectedSequenceIndex
      : null;
    const currentStateId = session.live_flow?.state?.id || "";
    const currentSequenceIndex = session.live_flow?.sequence?.currentIndex ?? null;
    if (!expectedStateId || !SPINNER_STATE_IDS.has(expectedStateId)) {
      return Response.json({ error: "Open a spinner lesson state before using this control." }, { status: 409 });
    }
    if (
      !SPINNER_STATE_IDS.has(currentStateId)
      || currentStateId !== expectedStateId
      || currentSequenceIndex === null
      || currentSequenceIndex !== expectedSequenceIndex
      || !session.live_flow?.updatedAt
    ) {
      return Response.json({ error: "The lesson moved before the spinner command arrived. Use the current state controls." }, { status: 409 });
    }
    spinnerStateId = currentStateId;
  }
  if (session.remote_command && !session.remote_command.receivedAt) {
    const issuedAt = Date.parse(session.remote_command.issuedAt);
    const stillDelivering = Number.isFinite(issuedAt) && Date.now() - issuedAt < REMOTE_COMMAND_STALE_MS;
    if (stillDelivering) {
      return Response.json({ error: "The previous classroom command is still being delivered." }, { status: 409 });
    }
  }
  const command: TeacherRemoteCommand = {
    nonce: crypto.randomUUID(),
    action,
    issuedAt: new Date().toISOString(),
    ...(spinnerStateId ? { stateId: spinnerStateId } : {}),
  };
  let workingSession = session;
  let liveFlow = workingSession.live_flow;
  let handledDirectly = false;
  let claimToken: string | null = null;
  let createdPollId: string | null = null;
  try {
    if (action === "next" || action === "previous") {
      const claim = await claimRemoteFlow(result.db, workingSession);
      workingSession = claim.session;
      liveFlow = workingSession.live_flow;
      claimToken = claim.token;
    }
    if (action === "next" || action === "previous") {
      const navigation = await navigateFlow(result.db, workingSession, action);
      liveFlow = navigation.liveFlow;
      createdPollId = navigation.createdPollId;
      handledDirectly = true;
    } else if (DIRECT_TIMER_ACTIONS.has(action)) {
      if (!liveFlow) throw new Error("Load a lesson before controlling its timer.");
      if (action === "toggle-timer" && !liveFlow.timer && liveFlow.poll?.stage === "results" && liveFlow.sequence) {
        const advanceMode = liveFlow.sequence.advanceMode === "automatic" ? "manual" : "automatic";
        liveFlow = {
          ...liveFlow,
          updatedAt: new Date().toISOString(),
          sequence: { ...liveFlow.sequence, advanceMode },
        };
      } else {
        liveFlow = updateTimer(liveFlow, action);
      }
      handledDirectly = true;
    } else if (DIRECT_BOARD_ACTIONS.has(action)) {
      if (!liveFlow) throw new Error("Load a lesson before opening the work space.");
      liveFlow = updateBoard(liveFlow, action === "show-board");
      handledDirectly = true;
    }
  } catch (error) {
    await closePollById(result.db, createdPollId);
    if (claimToken) await releaseRemoteFlowClaim(result.db, workingSession, claimToken, session.live_flow);
    return Response.json({ error: error instanceof Error ? error.message : "The Remote command could not be applied." }, { status: 409 });
  }

  if (handledDirectly) {
    if (!liveFlow) return Response.json({ error: "The Remote action did not secure the live lesson state." }, { status: 409 });
    command.receivedAt = new Date().toISOString();
    try {
      liveFlow = claimToken
        ? await persistClaimedFlow(result.db, workingSession, claimToken, liveFlow, command)
        : await persistDirectFlow(result.db, workingSession, liveFlow, command);
    } catch (error) {
      await closePollById(result.db, createdPollId);
      if (claimToken) await releaseRemoteFlowClaim(result.db, workingSession, claimToken, session.live_flow);
      return Response.json({ error: error instanceof Error ? error.message : "The Remote action could not be saved." }, { status: 409 });
    }
    if (claimToken) await closeOpenPolls(result.db, session.id, liveFlow.poll?.id || null);
    return Response.json({ ok: true, command, liveFlow });
  }

  let commandUpdate = result.db
    .from("sessions")
    .update({ remote_command: command })
    .eq("id", session.id)
    .eq("status", "open");
  if (action === "spin-spinner" && session.live_flow?.updatedAt) {
    commandUpdate = commandUpdate.filter("live_flow->>updatedAt", "eq", session.live_flow.updatedAt);
  }
  commandUpdate = session.remote_command?.nonce
    ? commandUpdate.filter("remote_command->>nonce", "eq", session.remote_command.nonce)
    : commandUpdate.is("remote_command", null);
  const { data, error } = await commandUpdate
    .select("remote_command")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) {
    return Response.json({
      error: action === "spin-spinner"
        ? "The lesson state changed before the spinner command arrived. Use the current state controls."
        : "Another classroom command arrived first. Tap again.",
    }, { status: 409 });
  }
  return Response.json({ ok: true, command });
}
