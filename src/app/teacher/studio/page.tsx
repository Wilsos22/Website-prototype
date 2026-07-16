"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { DEFAULT_STATES } from "@/lib/classStates";
import { classroomStageTheme } from "@/lib/classroomPilot";
import { liveAssignedToolRoute } from "@/lib/liveFlowContract";
import { TeacherApiError, teacherApiRequest } from "@/lib/teacherApi";

interface PublishedLesson {
  id: string;
  lessonCode: string;
  title: string;
  date: string;
}

interface LessonStep {
  id: string;
  title: string;
  order: number;
  startMinute: number;
  duration: number;
  stateId: string;
  studentDirections: string;
  teacherNotes: string;
  paperTask: string;
  tool: string;
  question: string;
  pollKind: "short-answer" | "multiple-choice" | "fist-to-five" | "";
  choices: string[];
  correctAnswer: string;
  standard: string;
  aiContext: string;
  advance: string;
  required: boolean;
  linkUrl: string;
  mainDisplay: string;
  paceDirections: string;
  studentAction: string;
  remoteActions: string;
  discussionStems: string;
  vocabulary: string;
  responseMode: string;
  workSpaceAvailable?: boolean;
}

interface LessonStepRecord extends LessonStep {
  lessonId: string;
  lastEditedTime: string;
}

interface StudioLesson {
  id: string;
  lessonCode: string;
  title: string;
  date: string;
  warmUpLink: string;
  exitTicketLink: string;
  learningIntention: string;
  successCriteria: string;
  selectedSuccessCriterion: string;
  discussionStems: string;
  discussionVocabulary: string;
  requiredPaperWork: string;
  requiredDigitalWork: string;
  optionalSupport: string;
  bigDogChallenge: string;
  dueAndTurnIn: string;
  helpPath: string;
  steps: LessonStep[];
}

interface StepDraft {
  duration: number;
  mainDisplay: string;
  paceDirections: string;
  studentAction: string;
  remoteActions: string;
  discussionStems: string;
  vocabulary: string;
  question: string;
  choices: string[];
  paperTask: string;
  tool: string;
  linkUrl: string;
  responseMode: string;
  workSpaceAvailable: boolean;
}

type EditableField = keyof StepDraft;
type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
type ConnectionState = "online" | "offline" | "reconnecting";

const STATE_BY_ID = new Map(DEFAULT_STATES.map((state) => [state.id, state]));
const RESPONSE_MODES = [
  "",
  "None",
  "Google Form",
  "Paper",
  "Short Answer",
  "Multiple Choice",
  "Fist to Five",
  "Assigned Tool",
  "Physical Response",
] as const;

const EDITABLE_FIELDS: EditableField[] = [
  "duration",
  "mainDisplay",
  "paceDirections",
  "studentAction",
  "remoteActions",
  "discussionStems",
  "vocabulary",
  "question",
  "choices",
  "paperTask",
  "tool",
  "linkUrl",
  "responseMode",
  "workSpaceAvailable",
];

function draftFromStep(step: LessonStep): StepDraft {
  return {
    duration: Math.max(1, step.duration || 1),
    mainDisplay: step.mainDisplay || "",
    paceDirections: step.paceDirections || "",
    studentAction: step.studentAction || "",
    remoteActions: step.remoteActions || "",
    discussionStems: step.discussionStems || "",
    vocabulary: step.vocabulary || "",
    question: step.question || "",
    choices: normalizeChoices(step.choices || []),
    paperTask: step.paperTask || "",
    tool: step.tool || "",
    linkUrl: step.linkUrl || "",
    responseMode: step.responseMode || "",
    workSpaceAvailable: Boolean(step.workSpaceAvailable),
  };
}

function splitLines(value: string | undefined): string[] {
  return (value || "")
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitVocabulary(value: string | undefined): string[] {
  return (value || "")
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeChoices(choices: string[] | null | undefined): string[] {
  return (choices || []).map((choice) => choice.trim()).filter(Boolean);
}

function choicesMatch(left: string[] | null | undefined, right: string[] | null | undefined): boolean {
  const normalizedLeft = normalizeChoices(left);
  const normalizedRight = normalizeChoices(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((choice, index) => choice === normalizedRight[index]);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function formatTimer(minutes: number): string {
  return `${String(Math.max(0, Math.round(minutes))).padStart(2, "0")}:00`;
}

function lessonOptionLabel(lesson: PublishedLesson): string {
  return `${lesson.lessonCode || "Lesson"} - ${lesson.title || "Untitled lesson"}`;
}

function stepLabel(step: LessonStep): string {
  return step.title || STATE_BY_ID.get(step.stateId)?.label || "Lesson state";
}

function buildChanges(base: StepDraft, draft: StepDraft): Partial<StepDraft> {
  const changes: Partial<StepDraft> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field === "choices") {
      if (!choicesMatch(base.choices, draft.choices)) changes.choices = normalizeChoices(draft.choices);
      continue;
    }
    if (base[field] !== draft[field]) {
      Object.assign(changes, { [field]: draft[field] });
    }
  }
  return changes;
}

function workSections(lesson: StudioLesson, step: LessonStep, draft: StepDraft) {
  return [
    { label: "Required paper work", body: draft.paperTask || lesson.requiredPaperWork || step.paperTask },
    { label: "Required digital work", body: lesson.requiredDigitalWork },
    { label: "Due and turn in", body: lesson.dueAndTurnIn },
    { label: "Help path", body: lesson.helpPath },
    { label: "Optional support", body: lesson.optionalSupport },
    { label: "Challenge", body: lesson.bigDogChallenge },
  ].filter((section) => section.body?.trim());
}

export default function LessonScreenStudioPage() {
  const [publishedLessons, setPublishedLessons] = useState<PublishedLesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [lesson, setLesson] = useState<StudioLesson | null>(null);
  const [selectedStepId, setSelectedStepId] = useState("");
  const [canonicalDraft, setCanonicalDraft] = useState<StepDraft | null>(null);
  const [draft, setDraft] = useState<StepDraft | null>(null);
  const [lastEditedTime, setLastEditedTime] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [connectionState, setConnectionState] = useState<ConnectionState>("online");
  const [message, setMessage] = useState("Choose a published lesson to review its screens.");
  const [lessonsLoading, setLessonsLoading] = useState(true);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [stepLoading, setStepLoading] = useState(false);
  const [conflictStep, setConflictStep] = useState<LessonStepRecord | null>(null);
  const lessonRequestRef = useRef(0);
  const stepRequestRef = useRef(0);
  const activeSelectionRef = useRef({ lessonId: "", stepId: "" });
  const lastEditedTimeRef = useRef<string | null>(null);

  const selectedStep = useMemo(
    () => lesson?.steps.find((step) => step.id === selectedStepId) ?? null,
    [lesson, selectedStepId],
  );

  const changes = useMemo(
    () => canonicalDraft && draft ? buildChanges(canonicalDraft, draft) : {},
    [canonicalDraft, draft],
  );
  const isDirty = Object.keys(changes).length > 0;

  useEffect(() => {
    activeSelectionRef.current = { lessonId: lesson?.id || "", stepId: selectedStepId };
  }, [lesson?.id, selectedStepId]);

  useEffect(() => {
    if (!isDirty) return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [isDirty]);

  useEffect(() => {
    if (saveState === "saving" || saveState === "conflict" || saveState === "error") return;
    setSaveState(isDirty ? "dirty" : saveState === "saved" ? "saved" : "idle");
  }, [isDirty, saveState]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await teacherApiRequest<{ lessons: PublishedLesson[] }>("/api/teacher/lessons");
        if (cancelled) return;
        const usable = (result.lessons || []).filter((item) => item.id && (item.lessonCode || item.title));
        setPublishedLessons(usable);
        const requested = new URLSearchParams(window.location.search).get("lessonId") || "";
        const initial = requested
          ? usable.some((item) => item.id === requested) ? requested : ""
          : usable[0]?.id || "";
        setSelectedLessonId(initial);
        if (requested && !initial) setMessage("That requested lesson is not in the published lesson archive. Choose the exact lesson before editing.");
        else if (!initial) setMessage("No published lessons are available.");
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Published lessons could not be loaded.");
      } finally {
        if (!cancelled) setLessonsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedLessonId) {
      setLesson(null);
      setSelectedStepId("");
      return;
    }
    const requestId = ++lessonRequestRef.current;
    setLessonLoading(true);
    setLesson(null);
    setSelectedStepId("");
    setCanonicalDraft(null);
    setDraft(null);
    lastEditedTimeRef.current = null;
    setLastEditedTime(null);
    setSaveState("idle");
    setConflictStep(null);
    setMessage("Loading the exact published lesson from Notion.");
    void (async () => {
      try {
        const result = await teacherApiRequest<{ lesson: StudioLesson | null }>(
          `/api/teacher/lesson?id=${encodeURIComponent(selectedLessonId)}`,
        );
        if (requestId !== lessonRequestRef.current) return;
        if (!result.lesson) throw new Error("That published lesson could not be found.");
        setLesson(result.lesson);
        const firstStep = result.lesson.steps[0];
        setSelectedStepId(firstStep?.id || "");
        setMessage(firstStep ? "Private preview. Nothing is being broadcast." : "This lesson has no related Lesson Steps yet.");
        const url = new URL(window.location.href);
        url.searchParams.set("lessonId", result.lesson.id);
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      } catch (error) {
        if (requestId === lessonRequestRef.current) {
          setMessage(error instanceof Error ? error.message : "The lesson could not be loaded.");
        }
      } finally {
        if (requestId === lessonRequestRef.current) setLessonLoading(false);
      }
    })();
  }, [selectedLessonId]);

  const loadStepRevision = useCallback(async (step: LessonStep, useCurrentDraft = false) => {
    const lessonId = lesson?.id;
    if (!lessonId) return;
    const requestId = ++stepRequestRef.current;
    const previousRevision = lastEditedTimeRef.current;
    setStepLoading(true);
    lastEditedTimeRef.current = null;
    setLastEditedTime(null);
    setConflictStep(null);
    setSaveState("idle");
    if (!useCurrentDraft) {
      const nextDraft = draftFromStep(step);
      setCanonicalDraft(nextDraft);
      setDraft(nextDraft);
    }
    try {
      const result = await teacherApiRequest<{ step: LessonStepRecord }>(
        `/api/teacher/lesson-step?lessonId=${encodeURIComponent(lessonId)}&stepId=${encodeURIComponent(step.id)}`,
      );
      if (requestId !== stepRequestRef.current) return;
      const nextDraft = draftFromStep(result.step);
      if (useCurrentDraft && previousRevision && result.step.lastEditedTime !== previousRevision) {
        setConflictStep(result.step);
        setSaveState("conflict");
        setConnectionState("online");
        setMessage("Notion changed while this draft was disconnected. Your local draft is still safe here.");
        return;
      }
      setCanonicalDraft(nextDraft);
      if (!useCurrentDraft) setDraft(nextDraft);
      lastEditedTimeRef.current = result.step.lastEditedTime;
      setLastEditedTime(result.step.lastEditedTime);
      setConnectionState("online");
      setMessage(useCurrentDraft
        ? "Reconnected to Notion. Your unsaved draft is still preserved in this Studio."
        : "Private preview. Nothing is being broadcast.");
    } catch (error) {
      if (requestId === stepRequestRef.current) {
        if (!navigator.onLine) setConnectionState("offline");
        setMessage(error instanceof Error ? error.message : "The latest Notion revision could not be verified.");
        setSaveState("error");
      }
    } finally {
      if (requestId === stepRequestRef.current) setStepLoading(false);
    }
  }, [lesson?.id]);

  useEffect(() => {
    const step = lesson?.steps.find((item) => item.id === selectedStepId);
    if (!step) return;
    void loadStepRevision(step);
  }, [lesson?.id, loadStepRevision, selectedStepId]);

  useEffect(() => {
    const markOffline = () => {
      setConnectionState("offline");
      setMessage("Offline. Your draft is safe here, but saving is paused until Notion reconnects.");
    };
    const reconnect = () => {
      setConnectionState("reconnecting");
      setMessage("Connection restored. Verifying the latest Notion revision before saving.");
      const step = lesson?.steps.find((item) => item.id === selectedStepId);
      if (!step) {
        setConnectionState("online");
        return;
      }
      void loadStepRevision(step, true).finally(() => {
        setConnectionState(navigator.onLine ? "online" : "offline");
      });
    };

    if (!navigator.onLine) markOffline();
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", reconnect);
    return () => {
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", reconnect);
    };
  }, [lesson?.steps, loadStepRevision, selectedStepId]);

  function updateDraft<K extends EditableField>(field: K, value: StepDraft[K]) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
    if (saveState !== "saving") {
      setSaveState("dirty");
      setMessage("Unsaved changes are visible only in this private preview.");
    }
  }

  function chooseLesson(id: string) {
    if (saveState === "saving") return;
    if (isDirty && !window.confirm("Discard the unsaved changes and open another lesson?")) return;
    setSelectedLessonId(id);
  }

  function chooseStep(id: string) {
    if (saveState === "saving") return;
    if (id === selectedStepId) return;
    if (isDirty && !window.confirm("Discard the unsaved changes and open another lesson state?")) return;
    stepRequestRef.current += 1;
    setStepLoading(true);
    setCanonicalDraft(null);
    setDraft(null);
    lastEditedTimeRef.current = null;
    setLastEditedTime(null);
    setConflictStep(null);
    setSaveState("idle");
    setSelectedStepId(id);
  }

  function discardChanges() {
    if (!canonicalDraft) return;
    setDraft(canonicalDraft);
    setSaveState("idle");
    setConflictStep(null);
    setMessage("Changes discarded. The preview matches Notion.");
  }

  function reloadConflict() {
    if (!conflictStep) return;
    const nextDraft = draftFromStep(conflictStep);
    setCanonicalDraft(nextDraft);
    setDraft(nextDraft);
    lastEditedTimeRef.current = conflictStep.lastEditedTime;
    setLastEditedTime(conflictStep.lastEditedTime);
    setConflictStep(null);
    setSaveState("idle");
    setLesson((current) => current ? {
      ...current,
      steps: current.steps.map((step) => step.id === conflictStep.id ? { ...step, ...conflictStep } : step),
    } : current);
    setMessage("Reloaded the current Notion version.");
  }

  async function saveToNotion() {
    if (
      !lesson
      || !selectedStep
      || !draft
      || !canonicalDraft
      || !isDirty
      || !lastEditedTime
      || connectionState !== "online"
      || hasStepValidationError
    ) return;
    const savingSelection = { lessonId: lesson.id, stepId: selectedStep.id };
    setSaveState("saving");
    setConflictStep(null);
    setMessage("Saving this lesson state to Notion.");
    try {
      const result = await teacherApiRequest<{ step: LessonStepRecord }>(
        `/api/teacher/lesson-step?lessonId=${encodeURIComponent(lesson.id)}&stepId=${encodeURIComponent(selectedStep.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            lessonId: lesson.id,
            stepId: selectedStep.id,
            expectedLastEditedTime: lastEditedTime,
            changes,
          }),
        },
      );
      if (
        activeSelectionRef.current.lessonId !== savingSelection.lessonId
        || activeSelectionRef.current.stepId !== savingSelection.stepId
      ) return;
      const nextDraft = draftFromStep(result.step);
      setLesson((current) => current ? {
        ...current,
        steps: current.steps.map((step) => step.id === result.step.id ? { ...step, ...result.step } : step),
      } : current);
      setCanonicalDraft(nextDraft);
      setDraft(nextDraft);
      lastEditedTimeRef.current = result.step.lastEditedTime;
      setLastEditedTime(result.step.lastEditedTime);
      setSaveState("saved");
      setMessage("Saved to Notion. No live classroom screen was changed.");
    } catch (error) {
      if (
        activeSelectionRef.current.lessonId !== savingSelection.lessonId
        || activeSelectionRef.current.stepId !== savingSelection.stepId
      ) return;
      if (!navigator.onLine) setConnectionState("offline");
      if (error instanceof TeacherApiError && error.status === 409) {
        try {
          const response = await fetch(
            `/api/teacher/lesson-step?lessonId=${encodeURIComponent(lesson.id)}&stepId=${encodeURIComponent(selectedStep.id)}`,
            { cache: "no-store", credentials: "same-origin" },
          );
          const result = await response.json() as { step?: LessonStepRecord };
          setConflictStep(result.step || null);
        } catch {
          setConflictStep(null);
        }
        setSaveState("conflict");
        setMessage("Notion changed after you opened this state. Your draft is still safe here.");
      } else {
        setSaveState("error");
        setMessage(error instanceof Error ? error.message : "The state could not be saved to Notion.");
      }
    }
  }

  const stateDefinition = selectedStep ? STATE_BY_ID.get(selectedStep.stateId) : null;
  const theme = selectedStep ? classroomStageTheme(selectedStep.stateId, selectedStep.title) : classroomStageTheme("launch");
  const isLearningCheck = theme.id === "learning-check";
  const isDiscussion = theme.id === "discussion";
  const isIndependent = theme.id === "independent" || theme.id === "closeout";
  const timer = draft ? formatTimer(draft.duration) : "--:--";
  const mainBody = selectedStep && draft
    ? draft.mainDisplay || draft.question || selectedStep.studentDirections || draft.paperTask || stateDefinition?.desc || "Add the main projector prompt."
    : "Choose a lesson state.";
  const paceBody = selectedStep && draft
    ? draft.paceDirections || selectedStep.studentDirections || stateDefinition?.desc || "Add the current directions."
    : "Current directions";
  const studentBody = selectedStep && draft
    ? draft.studentAction || selectedStep.studentDirections || stateDefinition?.desc || "Add one current student action."
    : "Current student action";
  const remoteBody = selectedStep && draft
    ? draft.remoteActions || selectedStep.teacherNotes || draft.paceDirections || selectedStep.studentDirections || "Add private teacher actions."
    : "Private teacher actions";
  const stems = splitLines(draft?.discussionStems || lesson?.discussionStems).slice(0, 4);
  const vocabulary = splitVocabulary(draft?.vocabulary || lesson?.discussionVocabulary).slice(0, 6);
  const paperSections = lesson && selectedStep && draft ? workSections(lesson, selectedStep, draft) : [];
  const normalizedResponseMode = draft?.responseMode.trim().toLowerCase() || "";
  const normalizedChoices = normalizeChoices(draft?.choices);
  const responseModeNeedsQuestion = normalizedResponseMode === "short answer" || normalizedResponseMode === "multiple choice";
  const responseValidationMessage = responseModeNeedsQuestion && !draft?.question.trim()
    ? `${draft?.responseMode || "This response mode"} requires a question.`
    : normalizedResponseMode === "multiple choice" && normalizedChoices.length < 2
      ? "Multiple Choice requires at least two choices."
      : normalizedResponseMode === "multiple choice"
        && new Set(normalizedChoices.map((choice) => choice.toLowerCase())).size !== normalizedChoices.length
        ? "Multiple Choice choices must be different."
        : null;
  const isAssignedTool = normalizedResponseMode === "assigned tool";
  const assignedToolRoute = isAssignedTool ? liveAssignedToolRoute(draft?.tool) : null;
  const assignedToolLink = isAssignedTool && draft?.linkUrl && isHttpUrl(draft.linkUrl) ? draft.linkUrl.trim() : "";
  const hasAssignedToolResource = Boolean(assignedToolRoute || assignedToolLink);
  const assignedToolValidationMessage = isAssignedTool && !hasAssignedToolResource
    ? "Assigned Tool requires a recognized Big Dog Math tool name or a valid resource link."
    : null;
  const hasStepValidationError = Boolean(responseValidationMessage || assignedToolValidationMessage);
  const assignedResourceLink = selectedStep && draft
    ? draft.linkUrl
      || (selectedStep.stateId === "warmup" ? lesson?.warmUpLink : "")
      || (selectedStep.stateId === "exit" ? lesson?.exitTicketLink : "")
    : "";
  const previewStyle = {
    "--studio-accent": theme.accent,
    "--studio-base": theme.projectorBase,
    "--studio-panel": theme.projectorPanel,
    "--studio-line-dark": theme.projectorLine,
    "--studio-muted-dark": theme.projectorMuted,
    "--studio-glow": theme.projectorGlow,
  } as CSSProperties;
  const selectedCriteria = splitLines(lesson?.selectedSuccessCriterion);
  const selectedCriterion = selectedCriteria[0] || "Choose one I can statement in Notion.";
  const statusLabel = connectionState === "offline"
    ? "Offline - draft safe"
    : connectionState === "reconnecting"
      ? "Reconnecting"
      : lessonsLoading || lessonLoading || stepLoading
    ? "Loading"
    : saveState === "dirty"
      ? "Unsaved"
      : saveState === "saving"
        ? "Saving"
        : saveState === "saved"
          ? "Saved"
          : saveState === "conflict"
            ? "Conflict"
            : saveState === "error"
              ? "Needs attention"
              : "Not changed";
  const statusClass = connectionState === "online" ? saveState : connectionState;

  return (
    <main className="studio-page" style={previewStyle}>
      <style>{`
        .studio-page { min-height:100vh; background:var(--bdb-ground); color:var(--bdb-ink); font-family:var(--bdb-font); }
        .studio-page * { box-sizing:border-box; }
        .studio-page button, .studio-page input, .studio-page textarea, .studio-page select { font:inherit; }
        .studio-top { height:76px; display:grid; grid-template-columns:118px auto minmax(260px,414px) minmax(20px,1fr) auto auto auto; align-items:center; gap:14px; border-bottom:1px solid #dcd4c6; background:color-mix(in srgb,var(--bdb-ground) 94%,white); padding:0 18px; }
        .studio-brand { color:var(--bdb-ink); font-size:1.05rem; font-weight:900; line-height:0.84; letter-spacing:-0.05em; text-decoration:none; }
        .studio-name { margin:0; white-space:nowrap; font-size:1rem; font-weight:850; letter-spacing:-0.02em; }
        .studio-lesson-select { width:100%; min-width:0; border:1px solid #d7cec0; border-radius:10px; background:#fbf8f2; color:var(--bdb-ink); padding:11px 42px 11px 14px; font-size:0.91rem; font-weight:650; }
        .studio-lesson-select:focus { outline:2px solid color-mix(in srgb,var(--bdb-coral) 42%,transparent); outline-offset:1px; }
        .studio-status { display:inline-flex; align-items:center; gap:8px; min-height:30px; border-radius:999px; background:#ebe5da; color:var(--bdb-ink-soft); padding:0 13px; white-space:nowrap; font-size:0.75rem; font-weight:800; }
        .studio-status::before { content:""; width:8px; height:8px; border-radius:50%; background:#8f877b; }
        .studio-status.saved { background:#d5efdd; color:#21623d; }
        .studio-status.saved::before { background:#2f9e6f; }
        .studio-status.dirty { background:#fff0d4; color:#76521a; }
        .studio-status.dirty::before { background:#c78b24; }
        .studio-status.conflict, .studio-status.error { background:#fbe1db; color:#8f341f; }
        .studio-status.conflict::before, .studio-status.error::before { background:var(--bdb-coral); }
        .studio-status.offline { background:#fbe1db; color:#8f341f; }
        .studio-status.offline::before { background:var(--bdb-coral); }
        .studio-status.reconnecting { background:#e2ebf6; color:#31577c; }
        .studio-status.reconnecting::before { background:#4d79a6; }
        .studio-top-action { display:inline-flex; min-height:42px; align-items:center; justify-content:center; border:1px solid #5e554a; border-radius:8px; background:transparent; color:var(--bdb-ink); padding:0 20px; text-decoration:none; white-space:nowrap; font-size:0.87rem; font-weight:750; cursor:pointer; }
        .studio-top-action.primary { border-color:#bf3e1f; background:#d34a24; color:white; min-width:146px; }
        .studio-top-action:disabled { opacity:0.45; cursor:not-allowed; }
        .studio-grid { height:calc(100vh - 76px); display:grid; grid-template-columns:266px minmax(620px,1fr) 432px; }
        .studio-states { min-width:0; overflow-y:auto; border-right:1px solid #dcd4c6; padding:18px; background:color-mix(in srgb,var(--bdb-ground) 96%,white); }
        .studio-kicker { margin:0 3px 17px; color:#645d54; font-size:0.64rem; font-weight:850; letter-spacing:0.14em; text-transform:uppercase; }
        .studio-kicker span { margin-left:8px; color:var(--bdb-ink); }
        .studio-state-list { overflow:hidden; border:1px solid #dcd4c6; border-radius:9px; background:#fbf8f2; }
        .studio-state { width:100%; min-height:58px; display:grid; grid-template-columns:25px minmax(0,1fr) auto; align-items:center; gap:6px; border:0; border-bottom:1px solid #ded7ca; background:transparent; color:var(--bdb-ink); padding:8px 12px; text-align:left; cursor:pointer; }
        .studio-state:last-child { border-bottom:0; }
        .studio-state:hover { background:#f3ecdf; }
        .studio-state:focus-visible { outline:3px solid var(--studio-accent); outline-offset:-3px; }
        .studio-state:disabled { cursor:wait; opacity:0.7; }
        .studio-state.selected { background:var(--studio-accent); color:var(--studio-base); }
        .studio-state-num { font-size:0.84rem; font-weight:700; }
        .studio-state-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.78rem; font-weight:800; }
        .studio-state-time { font-size:0.64rem; font-weight:700; opacity:0.75; }
        .studio-preview { min-width:0; overflow-y:auto; padding:17px 18px 28px; }
        .studio-private-banner { display:flex; align-items:center; justify-content:center; min-height:31px; margin-bottom:13px; border:1px solid #d8cfbf; border-radius:8px; background:#f5efe3; color:#655e53; font-size:0.72rem; font-weight:750; }
        .studio-preview-label { margin:0 0 7px 2px; color:#655e53; font-size:0.63rem; font-weight:850; letter-spacing:0.12em; text-transform:uppercase; }
        .studio-screen { position:relative; overflow:hidden; border-radius:12px; }
        .studio-main-screen, .studio-pace-screen { border:1px solid var(--studio-line-dark); background:radial-gradient(circle at 50% 48%,var(--studio-glow),transparent 55%),var(--studio-base); color:white; box-shadow:0 9px 22px rgba(45,31,20,0.13); }
        .studio-main-screen { min-height:315px; display:grid; place-items:center; padding:42px clamp(28px,5vw,72px); text-align:center; }
        .studio-main-top { position:absolute; inset:0 0 auto; height:46px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--studio-line-dark); background:color-mix(in srgb,var(--studio-panel) 94%,transparent); padding:0 14px; }
        .studio-phase { display:flex; align-items:center; gap:8px; color:var(--studio-muted-dark); font-size:0.68rem; font-weight:850; letter-spacing:0.08em; text-transform:uppercase; }
        .studio-phase::before { content:""; width:8px; height:8px; border-radius:2px; background:var(--studio-accent); }
        .studio-screen-time { color:white; font-size:1.1rem; font-weight:900; font-variant-numeric:tabular-nums; }
        .studio-main-copy { max-width:760px; white-space:pre-wrap; font-size:clamp(1.45rem,2.6vw,2.35rem); font-weight:850; line-height:1.2; text-wrap:balance; }
        .studio-round { margin:0 0 17px; color:var(--studio-accent); font-size:0.7rem; font-weight:900; letter-spacing:0.13em; text-transform:uppercase; }
        .studio-target { display:grid; gap:10px; max-width:760px; }
        .studio-target-intention { color:var(--studio-muted-dark); font-size:clamp(0.9rem,1.5vw,1.18rem); font-weight:700; }
        .studio-target-criterion { color:white; font-size:clamp(1.4rem,2.5vw,2.2rem); font-weight:900; }
        .studio-paper-grid { width:100%; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; text-align:left; }
        .studio-paper-item { border:1px solid var(--studio-line-dark); border-left:4px solid var(--studio-accent); border-radius:8px; background:color-mix(in srgb,var(--studio-panel) 90%,transparent); padding:11px 13px; }
        .studio-paper-label { margin:0 0 5px; color:var(--studio-accent); font-size:0.58rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .studio-paper-body { margin:0; color:white; font-size:0.82rem; font-weight:700; line-height:1.35; white-space:pre-wrap; }
        .studio-lower { display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:15px; }
        .studio-pace-screen, .studio-student-screen { min-height:245px; }
        .studio-pace-screen { display:grid; align-content:center; justify-items:center; gap:11px; padding:27px; text-align:center; }
        .studio-pace-direction { max-width:24ch; margin:0; color:white; font-size:clamp(1.1rem,2vw,1.55rem); font-weight:850; line-height:1.18; text-wrap:balance; }
        .studio-pace-time { color:var(--studio-accent); font-size:clamp(2.8rem,5.2vw,4.4rem); font-weight:900; line-height:0.9; font-variant-numeric:tabular-nums; letter-spacing:-0.05em; }
        .studio-support-line { max-width:100%; border:1px solid var(--studio-line-dark); border-radius:7px; background:color-mix(in srgb,var(--studio-panel) 90%,transparent); padding:8px 13px; color:white; font-size:0.74rem; font-weight:750; }
        .studio-vocab { display:flex; flex-wrap:wrap; justify-content:center; gap:7px; }
        .studio-vocab span { border-radius:999px; background:var(--studio-accent); color:var(--studio-base); padding:5px 10px; font-size:0.64rem; font-weight:900; }
        .studio-student-screen { border:1px solid #ddd4c5; background:radial-gradient(circle at 84% 12%,color-mix(in srgb,var(--studio-accent) 11%,transparent),transparent 40%),#fbf7ee; color:var(--bdb-ink); }
        .studio-student-top { height:38px; display:flex; align-items:center; gap:8px; border-bottom:1px solid #e5dccd; background:rgba(255,255,255,0.54); padding:0 12px; font-size:0.65rem; font-weight:800; }
        .studio-student-dot { width:9px; height:9px; border-radius:2px; background:var(--studio-accent); }
        .studio-student-body { min-height:205px; display:grid; align-content:center; justify-items:center; gap:14px; padding:22px; text-align:center; }
        .studio-student-round { margin:0; color:color-mix(in srgb,var(--studio-accent) 78%,#7a2c18); font-size:0.64rem; font-weight:900; letter-spacing:0.11em; text-transform:uppercase; }
        .studio-student-action { max-width:33ch; margin:0; color:var(--bdb-ink); font-size:clamp(0.95rem,1.7vw,1.22rem); font-weight:850; line-height:1.25; white-space:pre-wrap; text-wrap:balance; }
        .studio-student-support { max-width:100%; border:1px solid #d9cebc; border-radius:999px; background:#efe7d8; padding:7px 13px; color:#3e3931; font-size:0.7rem; font-weight:800; }
        .studio-fist { display:grid; grid-template-columns:repeat(6,30px); gap:5px; }
        .studio-fist span { display:grid; place-items:center; aspect-ratio:1; border:1px solid #d8cebd; border-radius:7px; background:white; font-size:0.72rem; font-weight:850; }
        .studio-form-action { border:1px solid color-mix(in srgb,var(--studio-accent) 55%,#c8bda9); border-radius:8px; background:var(--studio-accent); color:var(--studio-base); padding:9px 15px; font-size:0.72rem; font-weight:900; }
        .studio-remote-wrap { margin-top:17px; border-top:1px solid #ddd4c6; padding-top:17px; }
        .studio-remote { min-height:150px; display:grid; grid-template-columns:minmax(0,1.35fr) minmax(180px,0.7fr); gap:22px; border:1px solid #d9d0c2; border-radius:11px; background:linear-gradient(145deg,#eee8dc,#f8f4ec); padding:14px; }
        .studio-remote-title { margin:0 0 8px; color:#655e53; font-size:0.58rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .studio-remote-copy { margin:0; color:var(--bdb-ink); font-size:0.78rem; font-weight:750; line-height:1.4; white-space:pre-wrap; }
        .studio-remote-controls { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
        .studio-remote-key { min-height:34px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #d7cec0; border-radius:7px; background:white; padding:0 13px; color:var(--bdb-ink); font-size:0.66rem; font-weight:850; }
        .studio-remote-key.active { border-color:var(--studio-accent); background:color-mix(in srgb,var(--studio-accent) 12%,white); }
        .studio-remote-private { display:grid; align-content:center; gap:9px; border-left:1px solid #ddd4c6; padding-left:22px; }
        .studio-private-note { margin:0; color:#6a6258; font-size:0.69rem; font-weight:700; line-height:1.4; }
        .studio-editor { min-width:0; overflow-y:auto; border-left:1px solid #dcd4c6; background:color-mix(in srgb,var(--bdb-ground) 96%,white); padding:18px 26px 34px; }
        .studio-editor h1 { margin:0; font-size:1.42rem; line-height:1.05; font-weight:850; letter-spacing:-0.03em; }
        .studio-editor-intro { margin:9px 0 18px; color:var(--bdb-ink-soft); font-size:0.78rem; line-height:1.45; }
        .studio-alert { margin:0 0 15px; border:1px solid #d9d0c2; border-left:4px solid #c78b24; border-radius:7px; background:#fff6e5; padding:10px 12px; color:#684b1f; font-size:0.73rem; font-weight:700; line-height:1.4; }
        .studio-alert.error { border-left-color:var(--bdb-coral); background:#fff0ec; color:#7e311f; }
        .studio-alert-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:9px; }
        .studio-small-button { min-height:34px; border:1px solid currentColor; border-radius:7px; background:white; color:inherit; padding:0 11px; font-size:0.69rem; font-weight:800; cursor:pointer; }
        .studio-field { display:grid; gap:6px; margin-top:15px; }
        .studio-fields { min-width:0; margin:0; border:0; padding:0; }
        .studio-label { display:flex; justify-content:space-between; gap:10px; color:#6a6258; font-size:0.62rem; font-weight:850; letter-spacing:0.08em; text-transform:uppercase; }
        .studio-count { color:#9a9184; font-weight:650; letter-spacing:0; text-transform:none; }
        .studio-input { width:100%; border:1px solid #d8cfc1; border-radius:7px; background:rgba(255,255,255,0.78); color:var(--bdb-ink); padding:10px 11px; font-size:0.78rem; font-weight:650; line-height:1.45; }
        textarea.studio-input { min-height:76px; resize:vertical; }
        textarea.studio-input.large { min-height:112px; }
        .studio-input:focus { outline:2px solid color-mix(in srgb,var(--studio-accent) 42%,transparent); outline-offset:1px; border-color:var(--studio-accent); }
        .studio-duration { width:102px; }
        .studio-check { display:flex; align-items:flex-start; gap:9px; color:var(--bdb-ink); font-size:0.76rem; font-weight:700; line-height:1.4; }
        .studio-check input { margin-top:2px; accent-color:var(--studio-accent); }
        .studio-editor-section { margin-top:22px; border-top:1px solid #ddd4c6; padding-top:18px; }
        .studio-editor-section h2 { margin:0 0 5px; font-size:0.76rem; font-weight:900; letter-spacing:0.09em; text-transform:uppercase; }
        .studio-editor-section p { margin:0 0 12px; color:var(--bdb-ink-soft); font-size:0.72rem; line-height:1.4; }
        .studio-editor-actions { display:flex; gap:9px; margin-top:22px; }
        .studio-editor-actions .studio-top-action { flex:1; padding:0 12px; }
        .studio-empty { min-height:420px; display:grid; place-items:center; border:1px dashed #d4cabb; border-radius:12px; color:var(--bdb-ink-soft); padding:35px; text-align:center; font-weight:750; }
        @media (max-width:1280px) {
          .studio-top { grid-template-columns:92px auto minmax(220px,1fr) auto auto; }
          .studio-top .studio-status { display:none; }
          .studio-top > span[aria-hidden="true"] { display:none; }
          .studio-grid { grid-template-columns:220px minmax(540px,1fr); height:auto; min-height:calc(100vh - 76px); }
          .studio-editor { grid-column:1 / -1; border-left:0; border-top:1px solid #dcd4c6; overflow:visible; }
          .studio-states, .studio-preview { max-height:none; overflow:visible; }
        }
        @media (max-width:860px) {
          .studio-top { height:auto; min-height:76px; grid-template-columns:74px minmax(0,1fr) auto; padding:10px 14px; }
          .studio-name { display:none; }
          .studio-lesson-select { grid-column:2 / -1; grid-row:2; }
          .studio-top-action.review { display:none; }
          .studio-grid { grid-template-columns:1fr; }
          .studio-states { border-right:0; border-bottom:1px solid #dcd4c6; padding:14px; overflow-x:auto; }
          .studio-kicker { margin-bottom:9px; }
          .studio-state-list { display:flex; width:max-content; max-width:none; }
          .studio-state { width:190px; border-bottom:0; border-right:1px solid #ded7ca; }
          .studio-state:last-child { border-right:0; }
          .studio-lower { grid-template-columns:1fr 1fr; }
        }
        @media (max-width:650px) {
          .studio-top-action.primary { min-width:112px; padding:0 12px; }
          .studio-preview { padding:14px 12px 22px; }
          .studio-main-screen { min-height:280px; padding:55px 23px 26px; }
          .studio-main-copy { font-size:1.45rem; }
          .studio-paper-grid, .studio-lower, .studio-remote { grid-template-columns:1fr; }
          .studio-remote-private { border-left:0; border-top:1px solid #ddd4c6; padding:14px 0 0; }
          .studio-editor { padding:20px 16px 100px; }
          .studio-editor-actions { position:fixed; inset:auto 0 0; z-index:12; margin:0; border-top:1px solid #d7cec0; background:var(--bdb-ground); padding:10px 14px; }
        }
      `}</style>

      <header className="studio-top">
        <a
          className="studio-brand"
          href="/teacher"
          aria-label="Big Dog Math teacher home"
          onClick={(event) => {
            if (saveState === "saving" || (isDirty && !window.confirm("Discard the unsaved changes and leave the Studio?"))) event.preventDefault();
          }}
        >
          Big Dog<br />Math
        </a>
        <p className="studio-name">Lesson Screen Studio</p>
        <select
          className="studio-lesson-select"
          aria-label="Published lesson"
          value={selectedLessonId}
          disabled={lessonsLoading || saveState === "saving"}
          onChange={(event) => chooseLesson(event.target.value)}
        >
          {!selectedLessonId && <option value="">Choose a published lesson</option>}
          {publishedLessons.map((item) => <option value={item.id} key={item.id}>{lessonOptionLabel(item)}</option>)}
        </select>
        <span aria-hidden="true" />
        <span className={`studio-status ${statusClass}`}>{statusLabel}</span>
        <a
          className="studio-top-action review"
          href={lesson ? `/control?notionLessonId=${encodeURIComponent(lesson.id)}` : "/control"}
          onClick={(event) => {
            if (saveState === "saving" || (isDirty && !window.confirm("Discard the unsaved changes and review this lesson in Control?"))) event.preventDefault();
          }}
        >
          Review in Control
        </a>
        <button
          className="studio-top-action primary"
          type="button"
          disabled={!isDirty || saveState === "saving" || !lastEditedTime || connectionState !== "online" || hasStepValidationError}
          onClick={() => { void saveToNotion(); }}
        >
          {saveState === "saving" ? "Saving" : "Save to Notion"}
        </button>
      </header>

      <div className="studio-grid">
        <aside className="studio-states" aria-label="Lesson states">
          <p className="studio-kicker">Lesson states <span>{lesson?.steps.length || 0}</span></p>
          <div className="studio-state-list">
            {(lesson?.steps || []).map((step, index) => (
              <button
                className={`studio-state${step.id === selectedStepId ? " selected" : ""}`}
                type="button"
                key={step.id}
                disabled={saveState === "saving"}
                onClick={() => chooseStep(step.id)}
              >
                <span className="studio-state-num">{index + 1}</span>
                <span className="studio-state-name">{stepLabel(step)}</span>
                <span className="studio-state-time">{Math.max(1, step.duration || 1)} min</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="studio-preview" aria-label="Screen previews">
          <div className="studio-private-banner" role="status">{message}</div>
          {!lesson || !selectedStep || !draft ? (
            <div className="studio-empty">{lessonLoading ? "Loading the lesson screens." : message}</div>
          ) : (
            <>
              <p className="studio-preview-label">Main projector - public</p>
              <section className="studio-screen studio-main-screen" aria-label="Main projector preview">
                <div className="studio-main-top">
                  <span className="studio-phase">{stepLabel(selectedStep)}</span>
                  <span className="studio-screen-time">{timer}</span>
                </div>
                {isLearningCheck ? (
                  <div className="studio-target">
                    {lesson.learningIntention && <div className="studio-target-intention">{lesson.learningIntention}</div>}
                    <div className="studio-target-criterion">{selectedCriterion}</div>
                  </div>
                ) : isIndependent && paperSections.length > 0 ? (
                  <div className="studio-paper-grid">
                    {paperSections.map((section) => (
                      <article className="studio-paper-item" key={section.label}>
                        <p className="studio-paper-label">{section.label}</p>
                        <p className="studio-paper-body">{section.body}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div>
                    {isDiscussion && <p className="studio-round">Round 1 of 3</p>}
                    <div className="studio-main-copy">{mainBody}</div>
                  </div>
                )}
              </section>

              <div className="studio-lower">
                <div>
                  <p className="studio-preview-label">Pace + Support - public</p>
                  <section className="studio-screen studio-pace-screen" aria-label="Pace and Support preview">
                    <h2 className="studio-pace-direction">{paceBody}</h2>
                    <div className="studio-pace-time">{timer}</div>
                    {isDiscussion && stems[0] && <div className="studio-support-line">{stems[0]}</div>}
                    {isDiscussion && vocabulary.length > 0 && (
                      <div className="studio-vocab">{vocabulary.map((word) => <span key={word}>{word}</span>)}</div>
                    )}
                  </section>
                </div>

                <div>
                  <p className="studio-preview-label">Student Chromebook - public</p>
                  <section className="studio-screen studio-student-screen" aria-label="Student Chromebook preview">
                    <div className="studio-student-top"><span className="studio-student-dot" />{stepLabel(selectedStep)}</div>
                    <div className="studio-student-body">
                      {isDiscussion && <p className="studio-student-round">Round 1 of 3</p>}
                      <p className="studio-student-action">{studentBody}</p>
                      {isLearningCheck ? (
                        <div className="studio-fist" aria-label="Fist to Five preview">
                          {[0, 1, 2, 3, 4, 5].map((value) => <span key={value}>{value}</span>)}
                        </div>
                      ) : (selectedStep.stateId === "warmup" || selectedStep.stateId === "exit") && assignedResourceLink ? (
                        <div className="studio-form-action">Open assigned Google Form</div>
                      ) : isDiscussion && stems[0] ? (
                        <div className="studio-student-support">{stems[0]}</div>
                      ) : isAssignedTool && hasAssignedToolResource ? (
                        <div className="studio-student-support">
                          {assignedToolRoute ? `Assigned tool: ${draft.tool.trim()}` : "Open assigned resource"}
                        </div>
                      ) : isIndependent && lesson.optionalSupport ? (
                        <div className="studio-student-support">Optional support: {lesson.optionalSupport}</div>
                      ) : null}
                    </div>
                  </section>
                </div>
              </div>

              <div className="studio-remote-wrap">
                <p className="studio-preview-label">iPad Remote - private</p>
                <section className="studio-remote" aria-label="Private iPad Remote preview">
                  <div>
                    <p className="studio-remote-title">This state</p>
                    <p className="studio-remote-copy">{remoteBody}</p>
                    <div className="studio-remote-controls" aria-hidden="true">
                      {isDiscussion ? (
                        <>
                          <span className="studio-remote-key active">Round 1</span>
                          <span className="studio-remote-key">Round 2</span>
                          <span className="studio-remote-key">Round 3</span>
                          <span className="studio-remote-key">Restart round</span>
                          <span className="studio-remote-key">-0:30</span>
                          <span className="studio-remote-key">Pause</span>
                          <span className="studio-remote-key">+0:30</span>
                        </>
                      ) : (
                        <>
                          <span className="studio-remote-key">Back</span>
                          <span className="studio-remote-key active">Pause</span>
                          <span className="studio-remote-key">Next</span>
                          {draft.workSpaceAvailable && <span className="studio-remote-key">Open work space</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <aside className="studio-remote-private">
                    <p className="studio-remote-title">Private teacher surface</p>
                    <p className="studio-private-note">The Remote layout stays the same. Only these state-specific actions and private data change.</p>
                  </aside>
                </section>
              </div>
            </>
          )}
        </section>

        <aside className="studio-editor" aria-label="Selected lesson state editor">
          <h1>{selectedStep ? `Edit ${stepLabel(selectedStep)}` : "Edit lesson state"}</h1>
          <p className="studio-editor-intro">Changes update the private previews before saving. They never alter an active classroom session.</p>

          {saveState === "conflict" && (
            <div className="studio-alert error" role="alert">
              This state changed in Notion after you opened it. Your draft has not been discarded.
              <div className="studio-alert-actions">
                <button className="studio-small-button" type="button" disabled={!conflictStep} onClick={reloadConflict}>Reload Notion version</button>
              </div>
            </div>
          )}
          {saveState === "error" && (
            <div className="studio-alert error" role="alert">
              {message}
              {selectedStep && (
                <div className="studio-alert-actions">
                  <button className="studio-small-button" type="button" onClick={() => { void loadStepRevision(selectedStep, true); }}>Retry revision check</button>
                </div>
              )}
            </div>
          )}
          {saveState === "dirty" && <div className="studio-alert">Unsaved changes are visible only in this Studio.</div>}
          {selectedStep && !stateDefinition && (
            <div className="studio-alert error" role="alert">
              State ID "{selectedStep.stateId || "blank"}" is not in the classroom state bank. Fix the State ID in Notion before running this lesson.
            </div>
          )}
          {isLearningCheck && lesson && selectedCriteria.length !== 1 && (
            <div className="studio-alert error" role="alert">
              {selectedCriteria.length === 0
                ? "This lesson needs one Selected Success Criterion in Notion before the learning check is ready."
                : "Selected Success Criterion contains multiple statements. Choose exactly one I can statement in Notion."}
            </div>
          )}
          {responseValidationMessage && <div className="studio-alert error" role="alert">{responseValidationMessage}</div>}
          {assignedToolValidationMessage && <div className="studio-alert error" role="alert">{assignedToolValidationMessage}</div>}

          {selectedStep && draft ? (
            <fieldset className="studio-fields" disabled={stepLoading || saveState === "saving"}>
              <label className="studio-field">
                <span className="studio-label">Duration (minutes)</span>
                <input
                  className="studio-input studio-duration"
                  type="number"
                  min={1}
                  max={120}
                  value={draft.duration}
                  onChange={(event) => updateDraft("duration", Math.max(1, Math.min(120, Number(event.target.value) || 1)))}
                />
              </label>

              <label className="studio-field">
                <span className="studio-label">Main Display (projector prompt)<span className="studio-count">{draft.mainDisplay.length}</span></span>
                <textarea className="studio-input large" maxLength={2000} value={draft.mainDisplay} onChange={(event) => updateDraft("mainDisplay", event.target.value)} />
              </label>

              <label className="studio-field">
                <span className="studio-label">Pace Directions<span className="studio-count">{draft.paceDirections.length}</span></span>
                <textarea className="studio-input" maxLength={2000} value={draft.paceDirections} onChange={(event) => updateDraft("paceDirections", event.target.value)} />
              </label>

              <label className="studio-field">
                <span className="studio-label">Student Action (Chromebook)<span className="studio-count">{draft.studentAction.length}</span></span>
                <textarea className="studio-input" maxLength={2000} value={draft.studentAction} onChange={(event) => updateDraft("studentAction", event.target.value)} />
              </label>

              <label className="studio-field">
                <span className="studio-label">Response Mode</span>
                <select className="studio-input" value={draft.responseMode} onChange={(event) => updateDraft("responseMode", event.target.value)}>
                  {RESPONSE_MODES.map((mode) => <option value={mode} key={mode || "blank"}>{mode || "Not set"}</option>)}
                </select>
              </label>

              <label className="studio-field">
                <span className="studio-label">Remote Actions<span className="studio-count">{draft.remoteActions.length}</span></span>
                <textarea className="studio-input" maxLength={2000} value={draft.remoteActions} onChange={(event) => updateDraft("remoteActions", event.target.value)} />
              </label>

              <label className="studio-field studio-check">
                <input type="checkbox" checked={draft.workSpaceAvailable} onChange={(event) => updateDraft("workSpaceAvailable", event.target.checked)} />
                Work space can be opened from the private Remote
              </label>

              {isDiscussion && (
                <div className="studio-editor-section">
                  <h2>Discussion supports</h2>
                  <p>Sentence stems and vocabulary appear on the support and student previews.</p>
                  <label className="studio-field">
                    <span className="studio-label">Sentence Stems<span className="studio-count">{splitLines(draft.discussionStems).length}</span></span>
                    <textarea className="studio-input" maxLength={2000} value={draft.discussionStems} onChange={(event) => updateDraft("discussionStems", event.target.value)} />
                  </label>
                  <label className="studio-field">
                    <span className="studio-label">Vocabulary (key terms)<span className="studio-count">{splitVocabulary(draft.vocabulary).length}</span></span>
                    <textarea className="studio-input" maxLength={2000} value={draft.vocabulary} onChange={(event) => updateDraft("vocabulary", event.target.value)} />
                  </label>
                </div>
              )}

              {(selectedStep.pollKind || draft.question || responseModeNeedsQuestion) && (
                <div className="studio-editor-section">
                  <h2>Response prompt</h2>
                  <p>{selectedStep.pollKind ? `Response type: ${selectedStep.pollKind}` : "This prompt is used by the selected lesson state."}</p>
                  <label className="studio-field">
                    <span className="studio-label">Question<span className="studio-count">{draft.question.length}</span></span>
                    <textarea className="studio-input" maxLength={2000} value={draft.question} onChange={(event) => updateDraft("question", event.target.value)} />
                  </label>
                  {normalizedResponseMode === "multiple choice" && (
                    <label className="studio-field">
                      <span className="studio-label">Choices (one per line)<span className="studio-count">{normalizedChoices.length}</span></span>
                      <textarea
                        className="studio-input"
                        maxLength={2000}
                        value={draft.choices.join("\n")}
                        onChange={(event) => updateDraft("choices", event.target.value.split(/\r?\n/))}
                      />
                    </label>
                  )}
                </div>
              )}

              {(selectedStep.stateId === "warmup" || selectedStep.stateId === "exit" || assignedResourceLink || isAssignedTool) && (
                <div className="studio-editor-section">
                  <h2>Assigned resource</h2>
                  <p>{selectedStep.stateId === "warmup" || selectedStep.stateId === "exit"
                    ? "Warm-ups and exit tickets remain in their assigned Google Forms."
                    : "The assigned manipulative supports the paper-first task without replacing it."}</p>
                  {!draft.linkUrl && assignedResourceLink && <p>The preview is using the lesson-level form link. Add a link here only to override it for this state.</p>}
                  {isAssignedTool && (
                    <label className="studio-field">
                      <span className="studio-label">Tool Name</span>
                      <input className="studio-input" maxLength={2000} value={draft.tool} onChange={(event) => updateDraft("tool", event.target.value)} />
                    </label>
                  )}
                  <label className="studio-field">
                    <span className="studio-label">Resource Link</span>
                    <input className="studio-input" type="url" maxLength={2000} value={draft.linkUrl} onChange={(event) => updateDraft("linkUrl", event.target.value)} />
                  </label>
                </div>
              )}

              {isIndependent && (
                <div className="studio-editor-section">
                  <h2>Paper-first work</h2>
                  <p>The site directs the assignment without copying the paper problems.</p>
                  <label className="studio-field">
                    <span className="studio-label">Paper Task</span>
                    <textarea className="studio-input" maxLength={2000} value={draft.paperTask} onChange={(event) => updateDraft("paperTask", event.target.value)} />
                  </label>
                </div>
              )}

              <div className="studio-editor-actions">
                <button className="studio-top-action" type="button" disabled={!isDirty || saveState === "saving"} onClick={discardChanges}>Discard</button>
                <button className="studio-top-action primary" type="button" disabled={!isDirty || saveState === "saving" || !lastEditedTime || connectionState !== "online" || hasStepValidationError} onClick={() => { void saveToNotion(); }}>
                  {saveState === "saving" ? "Saving" : "Save to Notion"}
                </button>
              </div>
            </fieldset>
          ) : (
            <div className="studio-empty">{stepLoading ? "Loading the selected state." : "Choose a lesson state to edit."}</div>
          )}
        </aside>
      </div>
    </main>
  );
}
