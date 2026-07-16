"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import LessonVisual from "@/components/LessonVisual";
import { BANK_GROUPS, CLOSEOUT_DIRECTIONS, DEFAULT_STATES, classStateStepDefaults } from "@/lib/classStates";
import { classroomStageTheme, discussionSupportsForLesson, usesDiscussionProtocol } from "@/lib/classroomPilot";
import { DISCUSSION_ROUNDS } from "@/lib/discussionProtocol";
import {
  lessonStoryImageMarkup,
  lessonStoryImages,
  removeLessonStoryImage,
  resolveLessonVisual,
} from "@/lib/lessonVisuals";
import { liveAssignedToolRoute, liveIndependentSupportItems, resolveLiveStepPollKind } from "@/lib/liveFlowContract";
import {
  defaultLessonRoutineConfig,
  validateLessonRoutineConfig,
  type LessonRoutineConfig,
  type PublicLessonRoutineConfig,
} from "@/lib/lessonRoutineConfig";
import {
  defaultPublicSurfaceModeForState,
  type PublicSurfaceMode,
} from "@/lib/lessonStepMetadata";
import { speakerNoteItems } from "@/lib/speakerNotes";
import {
  inspectSelectedSuccessCriterion,
  publicSuccessCriterion,
} from "@/lib/successCriterion";
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
  publicSurfaceMode?: PublicSurfaceMode;
  routineConfig?: LessonRoutineConfig | PublicLessonRoutineConfig | null;
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
  publicSurfaceMode: PublicSurfaceMode;
  routineConfig: LessonRoutineConfig | null;
}

interface SurfaceTextResolution {
  text: string;
  inheritedText: string;
  source: string;
  isOverride: boolean;
}

type EditableField = keyof StepDraft;
type SurfaceField = "mainDisplay" | "paceDirections" | "studentAction" | "remoteActions";
type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
type ConnectionState = "online" | "offline" | "reconnecting";
type SequenceChangeState = "idle" | "adding" | "replacing";

interface AddMutationIntent {
  key: string;
  token: string;
}

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
  "publicSurfaceMode",
  "routineConfig",
];

function fullRoutineConfigForStep(step: LessonStep): LessonRoutineConfig | null {
  const config = step.routineConfig;
  if (config?.kind === "gallery-walk" && "materials" in config) return config;
  if (config?.kind === "small-group" && "teacherPlan" in config) return config;
  return defaultLessonRoutineConfig(step.stateId);
}

function lessonRoutineValidationMessage(config: LessonRoutineConfig | null): string | null {
  if (!config) return null;
  try {
    validateLessonRoutineConfig(config);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Finish this lesson routine configuration before saving.";
  }
}

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
    publicSurfaceMode: step.publicSurfaceMode || defaultPublicSurfaceModeForState(step.stateId),
    routineConfig: fullRoutineConfigForStep(step),
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

function resolveSurfaceText(
  override: string,
  fallbacks: Array<{ text: string | undefined; source: string }>,
): SurfaceTextResolution {
  const inherited = fallbacks.find((fallback) => Boolean(fallback.text));
  const inheritedText = inherited?.text || "";
  return {
    text: override || inheritedText,
    inheritedText,
    source: override ? "Custom screen text" : inherited?.source || "",
    isOverride: Boolean(override),
  };
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
  const [surfaceEditBuffers, setSurfaceEditBuffers] = useState<Partial<Record<SurfaceField, string>>>({});
  const [lastEditedTime, setLastEditedTime] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [connectionState, setConnectionState] = useState<ConnectionState>("online");
  const [message, setMessage] = useState("Choose a published lesson to review its screens.");
  const [lessonsLoading, setLessonsLoading] = useState(true);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [stepLoading, setStepLoading] = useState(false);
  const [conflictStep, setConflictStep] = useState<LessonStepRecord | null>(null);
  const [catalogStateId, setCatalogStateId] = useState("learning-target-readers");
  const [sequenceChangeState, setSequenceChangeState] = useState<SequenceChangeState>("idle");
  const [storyImageUrl, setStoryImageUrl] = useState("");
  const [storyImageMessage, setStoryImageMessage] = useState("");
  const lessonRequestRef = useRef(0);
  const stepRequestRef = useRef(0);
  const activeSelectionRef = useRef({ lessonId: "", stepId: "" });
  const lastEditedTimeRef = useRef<string | null>(null);
  const skipStepLoadRef = useRef("");
  const addMutationRef = useRef<AddMutationIntent | null>(null);

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
    setSurfaceEditBuffers({});
    setStoryImageUrl("");
    setStoryImageMessage("");
  }, [selectedLessonId, selectedStepId]);

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
      setLesson((current) => current ? {
        ...current,
        steps: current.steps.map((currentStep) => currentStep.id === result.step.id
          ? { ...currentStep, ...result.step }
          : currentStep),
      } : current);
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
    if (skipStepLoadRef.current === step.id) {
      skipStepLoadRef.current = "";
      return;
    }
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

  function beginSurfaceEdit(field: SurfaceField, value: string) {
    setSurfaceEditBuffers((current) => Object.prototype.hasOwnProperty.call(current, field)
      ? current
      : { ...current, [field]: value });
  }

  function endSurfaceEdit(field: SurfaceField) {
    setSurfaceEditBuffers((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, field)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateSurfaceField(field: SurfaceField, value: string, resolution: SurfaceTextResolution) {
    setSurfaceEditBuffers((current) => ({ ...current, [field]: value }));
    const canonicalValue = canonicalDraft?.[field] || "";
    updateDraft(field, !canonicalValue && value === resolution.inheritedText ? "" : value);
  }

  function useInheritedSurfaceText(field: SurfaceField) {
    endSurfaceEdit(field);
    updateDraft(field, "");
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
    setSurfaceEditBuffers({});
    setSaveState("idle");
    setConflictStep(null);
    setMessage("Changes discarded. The preview matches Notion.");
  }

  function reloadConflict() {
    if (!conflictStep) return;
    const nextDraft = draftFromStep(conflictStep);
    setCanonicalDraft(nextDraft);
    setDraft(nextDraft);
    setSurfaceEditBuffers({});
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
      setSurfaceEditBuffers({});
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

  async function addCatalogState() {
    const state = STATE_BY_ID.get(catalogStateId);
    if (!lesson || !state || isDirty || sequenceChangeState !== "idle" || connectionState !== "online") return;
    const insertAfterStepId = selectedStep?.id || null;
    const intentKey = `${lesson.id}:${insertAfterStepId || "first"}:${state.id}`;
    const mutationToken = addMutationRef.current?.key === intentKey
      ? addMutationRef.current.token
      : crypto.randomUUID();
    addMutationRef.current = { key: intentKey, token: mutationToken };
    setSequenceChangeState("adding");
    setMessage(`Adding ${state.label} to the Notion lesson.`);
    try {
      const result = await teacherApiRequest<{ step: LessonStepRecord }>("/api/teacher/lesson-step", {
        method: "POST",
        body: JSON.stringify({ lessonId: lesson.id, insertAfterStepId, stateId: state.id, mutationToken }),
      });
      addMutationRef.current = null;
      setLesson((current) => {
        if (!current) return current;
        const nextSteps = [...current.steps];
        const anchorIndex = insertAfterStepId
          ? nextSteps.findIndex((step) => step.id === insertAfterStepId)
          : -1;
        nextSteps.splice(anchorIndex + 1, 0, result.step);
        return { ...current, steps: nextSteps };
      });
      void refreshSequenceAfterWrite(lesson.id, result.step);
      const nextDraft = draftFromStep(result.step);
      skipStepLoadRef.current = result.step.id;
      setSelectedStepId(result.step.id);
      setCanonicalDraft(nextDraft);
      setDraft(nextDraft);
      setSurfaceEditBuffers({});
      lastEditedTimeRef.current = result.step.lastEditedTime;
      setLastEditedTime(result.step.lastEditedTime);
      setConflictStep(null);
      setSaveState("saved");
      setMessage(`Added ${state.label} to Notion. No live classroom screen was changed.`);
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "The lesson state could not be added to Notion.");
    } finally {
      setSequenceChangeState("idle");
    }
  }

  async function replaceWithCatalogState() {
    const state = STATE_BY_ID.get(catalogStateId);
    if (
      !lesson
      || !selectedStep
      || !state
      || !lastEditedTime
      || isDirty
      || selectedStep.stateId === state.id
      || sequenceChangeState !== "idle"
      || connectionState !== "online"
    ) return;
    if (!window.confirm(`Replace "${stepLabel(selectedStep)}" with "${state.label}"? The old state's screen-specific content will be reset to the new state template.`)) return;

    setSequenceChangeState("replacing");
    setMessage(`Replacing this lesson state with ${state.label} in Notion.`);
    try {
      const result = await teacherApiRequest<{ step: LessonStepRecord }>(
        `/api/teacher/lesson-step?lessonId=${encodeURIComponent(lesson.id)}&stepId=${encodeURIComponent(selectedStep.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            lessonId: lesson.id,
            stepId: selectedStep.id,
            expectedLastEditedTime: lastEditedTime,
            changes: {
              ...classStateStepDefaults(state),
              aiContext: "",
              publicSurfaceMode: defaultPublicSurfaceModeForState(state.id),
              routineConfig: defaultLessonRoutineConfig(state.id),
            },
          }),
        },
      );
      const nextDraft = draftFromStep(result.step);
      setLesson((current) => current ? {
        ...current,
        steps: current.steps.map((step) => step.id === result.step.id ? { ...step, ...result.step } : step),
      } : current);
      void refreshSequenceAfterWrite(lesson.id, result.step);
      setCanonicalDraft(nextDraft);
      setDraft(nextDraft);
      setSurfaceEditBuffers({});
      lastEditedTimeRef.current = result.step.lastEditedTime;
      setLastEditedTime(result.step.lastEditedTime);
      setConflictStep(null);
      setSaveState("saved");
      setMessage(`Replaced the state with ${state.label} in Notion. No live classroom screen was changed.`);
    } catch (error) {
      if (error instanceof TeacherApiError && error.status === 409) setSaveState("conflict");
      else setSaveState("error");
      setMessage(error instanceof Error ? error.message : "The lesson state could not be replaced in Notion.");
    } finally {
      setSequenceChangeState("idle");
    }
  }

  async function refreshSequenceAfterWrite(lessonId: string, writtenStep: LessonStepRecord) {
    try {
      const result = await teacherApiRequest<{ lesson: StudioLesson | null }>(
        `/api/teacher/lesson?id=${encodeURIComponent(lessonId)}`,
      );
      const refreshedLesson = result.lesson;
      if (!refreshedLesson) return;
      setLesson((current) => {
        if (!current || current.id !== lessonId) return current;
        return {
          ...refreshedLesson,
          steps: refreshedLesson.steps.map((step) => step.id === writtenStep.id
            ? { ...step, ...writtenStep }
            : step),
        };
      });
    } catch {
      // The write is already durable. A normal lesson refresh will reconcile the sidebar.
    }
  }

  const stateDefinition = selectedStep ? STATE_BY_ID.get(selectedStep.stateId) : null;
  const theme = selectedStep ? classroomStageTheme(selectedStep.stateId, selectedStep.title) : classroomStageTheme("launch");
  const isLearningCheck = theme.id === "learning-check";
  const isReaderSpinner = selectedStep?.stateId === "learning-target-readers";
  const isIpadKidSpinner = selectedStep?.stateId === "ipad-kid";
  const showsLessonTargets = isReaderSpinner || isLearningCheck;
  const isDiscussion = usesDiscussionProtocol(selectedStep?.stateId, selectedStep?.title);
  const isIndependent = theme.id === "independent";
  const isCloseout = theme.id === "closeout";
  const publicSurfacesLinked = draft?.publicSurfaceMode === "linked";
  const galleryWalkConfig = draft?.routineConfig?.kind === "gallery-walk" ? draft.routineConfig : null;
  const smallGroupConfig = draft?.routineConfig?.kind === "small-group" ? draft.routineConfig : null;
  const timer = draft ? formatTimer(draft.duration) : "--:--";
  const previewTimer = isDiscussion ? "02:00" : timer;
  const previewDiscussionRound = DISCUSSION_ROUNDS[0];
  const configuredDiscussionSupports = discussionSupportsForLesson(lesson?.lessonCode);
  const discussionStemsEditorText = draft?.discussionStems
    || lesson?.discussionStems
    || configuredDiscussionSupports.sentenceStems.join("\n");
  const vocabularyEditorText = draft?.vocabulary
    || lesson?.discussionVocabulary
    || configuredDiscussionSupports.keyVocabulary.join("\n");
  const stems = splitLines(discussionStemsEditorText).slice(0, 4);
  const vocabulary = splitVocabulary(vocabularyEditorText).slice(0, 6);
  const paperSections = lesson && selectedStep && draft ? workSections(lesson, selectedStep, draft) : [];
  const mainText = resolveSurfaceText(draft?.mainDisplay || "", [
    { text: draft?.question, source: "Question" },
    { text: selectedStep?.studentDirections, source: "Student Directions" },
    { text: draft?.paperTask, source: "Paper Task" },
    { text: stateDefinition?.desc, source: "state template" },
  ]);
  const paceText = resolveSurfaceText(draft?.paceDirections || "", [
    { text: stateDefinition?.paceAction, source: "short state action" },
    { text: selectedStep?.studentDirections, source: "Student Directions" },
    { text: stateDefinition?.desc, source: "state template" },
  ]);
  const studentText = resolveSurfaceText(draft?.studentAction || "", [
    { text: stateDefinition?.studentAction, source: "short state action" },
    { text: selectedStep?.studentDirections, source: "Student Directions" },
    { text: stateDefinition?.desc, source: "state template" },
  ]);
  const remoteText = resolveSurfaceText(draft?.remoteActions || "", [
    { text: stateDefinition?.remoteAction, source: "private state action" },
    { text: selectedStep?.teacherNotes, source: "Teacher Notes" },
    { text: draft?.paceDirections, source: "Pace Directions" },
    { text: selectedStep?.studentDirections, source: "Student Directions" },
  ]);
  const mainEditorText = isCloseout
    ? CLOSEOUT_DIRECTIONS
    : Object.prototype.hasOwnProperty.call(surfaceEditBuffers, "mainDisplay")
      ? surfaceEditBuffers.mainDisplay || ""
      : mainText.text;
  const configuredStoryImages = lessonStoryImages(mainEditorText);

  function addStoryImage(url: string, alt: string) {
    const trimmedUrl = url.trim();
    if (!isHttpUrl(trimmedUrl)) {
      setStoryImageMessage("Paste a public image address that starts with http or https.");
      return;
    }
    if (configuredStoryImages.some((image) => image.url === trimmedUrl)) {
      setStoryImageMessage("That image is already part of this story slide.");
      return;
    }
    if (configuredStoryImages.length >= 3) {
      setStoryImageMessage("Use no more than three images in one story slide.");
      return;
    }
    const nextText = `${lessonStoryImageMarkup(trimmedUrl, alt)}\n${mainEditorText}`.trim();
    if (nextText.length > 2000) {
      setStoryImageMessage("The image address would make Main Display longer than Notion allows.");
      return;
    }
    updateSurfaceField("mainDisplay", nextText, mainText);
    setStoryImageUrl("");
    setStoryImageMessage("Image added to the private preview. Save to Notion when the slide is ready.");
  }

  function removeStoryImage(url: string) {
    updateSurfaceField("mainDisplay", removeLessonStoryImage(mainEditorText, url), mainText);
    setStoryImageMessage("Image removed from the private preview. Save to Notion to keep the change.");
  }
  const paceEditorText = isCloseout
    ? CLOSEOUT_DIRECTIONS
    : Object.prototype.hasOwnProperty.call(surfaceEditBuffers, "paceDirections")
      ? surfaceEditBuffers.paceDirections || ""
      : paceText.text;
  const studentEditorText = isCloseout
    ? CLOSEOUT_DIRECTIONS
    : Object.prototype.hasOwnProperty.call(surfaceEditBuffers, "studentAction")
      ? surfaceEditBuffers.studentAction || ""
      : studentText.text;
  const remoteEditorText = Object.prototype.hasOwnProperty.call(surfaceEditBuffers, "remoteActions")
    ? surfaceEditBuffers.remoteActions || ""
    : remoteText.text;
  const mainBody = isCloseout
    ? CLOSEOUT_DIRECTIONS
    : galleryWalkConfig
      ? galleryWalkConfig.observationPrompt
      : smallGroupConfig
        ? smallGroupConfig.publicTask
        : selectedStep && draft ? mainEditorText || "Add the main projector prompt." : "Choose a lesson state.";
  const paceBody = isCloseout
    ? CLOSEOUT_DIRECTIONS
    : publicSurfacesLinked
      ? mainBody
      : galleryWalkConfig
        ? galleryWalkConfig.movementDirections
        : smallGroupConfig
          ? `Work with your group. Rotate every ${smallGroupConfig.rotationMinutes} minutes.`
          : selectedStep && draft ? paceEditorText || "Add the current directions." : "Current directions";
  const studentBody = isCloseout
    ? CLOSEOUT_DIRECTIONS
    : publicSurfacesLinked
      ? mainBody
      : galleryWalkConfig
        ? galleryWalkConfig.recordPrompt
        : smallGroupConfig
          ? smallGroupConfig.publicTask
          : selectedStep && draft ? studentEditorText || "Add one current student action." : "Current student action";
  const remoteBody = selectedStep && draft ? remoteEditorText || "Add private teacher actions." : "Private teacher actions";
  const remoteSpeakerNotes = speakerNoteItems(remoteBody);
  const mainScreenUsesStructuredLayout = showsLessonTargets
    || isIpadKidSpinner
    || Boolean(galleryWalkConfig || smallGroupConfig)
    || (isIndependent && paperSections.length > 0);
  const canUseStoryImages = theme.id === "scenario" && !mainScreenUsesStructuredLayout;
  const lessonVisual = selectedStep && draft ? resolveLessonVisual({
    lessonCode: lesson?.lessonCode,
    stateId: theme.id,
    text: mainEditorText,
    fallbackTexts: [selectedStep.studentDirections, draft.question, draft.paperTask],
    contextSteps: lesson?.steps.map((step) => ({
      stateId: classroomStageTheme(step.stateId, step.title).id,
      text: step.mainDisplay || step.studentDirections || step.question || step.paperTask,
    })),
    currentStepIndex: lesson?.steps.findIndex((step) => step.id === selectedStep.id),
  }) : null;
  const normalizedResponseMode = draft?.responseMode.trim().toLowerCase() || "";
  const normalizedChoices = normalizeChoices(draft?.choices);
  const effectiveResponseKind = isDiscussion
    ? null
    : resolveLiveStepPollKind(
        draft?.responseMode,
        selectedStep?.pollKind,
        selectedStep?.stateId,
      );
  const responseModeNeedsQuestion = Boolean(effectiveResponseKind);
  const responseValidationMessage = responseModeNeedsQuestion && !draft?.question.trim()
    ? `${draft?.responseMode || selectedStep?.pollKind || "This response mode"} requires a question.`
    : effectiveResponseKind === "multiple-choice" && normalizedChoices.length < 2
      ? "Multiple Choice requires at least two choices."
      : effectiveResponseKind === "multiple-choice"
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
  const routineValidationMessage = lessonRoutineValidationMessage(draft?.routineConfig || null);
  const criterionInspection = inspectSelectedSuccessCriterion(lesson?.selectedSuccessCriterion);
  const criterionValidationMessage = lesson ? criterionInspection.message : null;
  const hasStepValidationError = Boolean(
    criterionValidationMessage
    || responseValidationMessage
    || assignedToolValidationMessage
    || routineValidationMessage,
  );
  const assignedResourceLink = selectedStep && draft
    ? draft.linkUrl
      || (selectedStep.stateId === "warmup" ? lesson?.warmUpLink : "")
      || (selectedStep.stateId === "exit" ? lesson?.exitTicketLink : "")
    : "";
  const hasConfiguredPollSurface = Boolean(effectiveResponseKind);
  const studioPollSurfaceWins = hasConfiguredPollSurface && (isLearningCheck || !draft?.mainDisplay);
  const hasConfiguredResourceSurface = Boolean(assignedResourceLink || (isAssignedTool && hasAssignedToolResource));
  const studioResourceSurfaceWins = hasConfiguredResourceSurface
    && !studioPollSurfaceWins
    && (isAssignedTool || !draft?.mainDisplay);
  const showLessonVisual = !isReaderSpinner && !isIpadKidSpinner && !studioPollSurfaceWins && !studioResourceSurfaceWins
    ? lessonVisual
    : null;
  const previewStyle = {
    "--studio-accent": theme.accent,
    "--studio-base": theme.projectorBase,
    "--studio-panel": theme.projectorPanel,
    "--studio-line-dark": theme.projectorLine,
    "--studio-muted-dark": theme.projectorMuted,
    "--studio-glow": theme.projectorGlow,
  } as CSSProperties;
  const selectedCriterion = publicSuccessCriterion(lesson?.selectedSuccessCriterion);
  const studentIndependentSupports = liveIndependentSupportItems(selectedStep?.stateId, lesson);
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
  const lessonTotalMinutes = (lesson?.steps || []).reduce((sum, step) => sum + Math.max(1, step.duration || 1), 0);
  const catalogState = STATE_BY_ID.get(catalogStateId) || null;
  const sequenceControlsDisabled = sequenceChangeState !== "idle"
    || saveState === "saving"
    || isDirty
    || connectionState !== "online"
    || lessonLoading
    || stepLoading
    || Boolean(criterionValidationMessage);
  const sequencePicker = lesson ? (
    <div className="studio-sequence-picker">
      <label className="studio-picker-label" htmlFor="studio-catalog-state">Potential state</label>
      <select
        id="studio-catalog-state"
        className="studio-picker-select"
        value={catalogStateId}
        disabled={sequenceChangeState !== "idle"}
        onChange={(event) => setCatalogStateId(event.target.value)}
      >
        {BANK_GROUPS.map((group) => (
          <optgroup label={group.label} key={group.id}>
            {group.stateIds.map((stateId) => {
              const state = STATE_BY_ID.get(stateId);
              return state ? (
                <option value={state.id} key={state.id}>
                  {state.label}{state.scheduleHint ? ` - ${state.scheduleHint}` : ""}
                </option>
              ) : null;
            })}
          </optgroup>
        ))}
      </select>
      {catalogState && (
        <div className="studio-picker-description">
          <span className="studio-picker-dot" style={{ background: catalogState.color }} />
          <span>{catalogState.minutes} min</span>
          {catalogState.scheduleHint && <span className="studio-picker-schedule">{catalogState.scheduleHint} routine</span>}
          <p>{catalogState.desc}</p>
        </div>
      )}
      {isDirty && <p className="studio-picker-warning">Save or discard the current text changes before changing the sequence.</p>}
      <div className="studio-picker-actions">
        <button
          className="studio-picker-button primary"
          type="button"
          disabled={sequenceControlsDisabled}
          onClick={() => { void addCatalogState(); }}
        >
          {sequenceChangeState === "adding" ? "Adding" : selectedStep ? "Add after this state" : "Add first state"}
        </button>
        <button
          className="studio-picker-button"
          type="button"
          disabled={sequenceControlsDisabled || !selectedStep || catalogStateId === selectedStep.stateId}
          onClick={() => { void replaceWithCatalogState(); }}
        >
          {sequenceChangeState === "replacing"
            ? "Replacing"
            : selectedStep && catalogStateId === selectedStep.stateId
              ? "Already this state"
              : "Replace this state"}
        </button>
      </div>
      <p className="studio-picker-note">Changes save to Notion. They do not change an active classroom session.</p>
    </div>
  ) : null;

  function publicSpinnerPreview(compact = false) {
    if (!lesson || (!isReaderSpinner && !isIpadKidSpinner)) return null;
    const reels = isReaderSpinner
      ? [
          { label: "Learning Intention", target: lesson.learningIntention || "Add the Learning Intention in Notion." },
          { label: "Success Criterion", target: selectedCriterion },
        ]
      : [{ label: "iPad Kid", target: "This week's classroom role" }];
    return (
      <div className={`studio-spinner-preview${isIpadKidSpinner ? " single" : ""}${compact ? " compact" : ""}`}>
        {reels.map((reel) => (
          <article className="studio-spinner-reel" key={reel.label}>
            <p>{reel.label}</p>
            <strong>{reel.target}</strong>
            <span>Student name</span>
          </article>
        ))}
      </div>
    );
  }

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
        .studio-kicker .studio-total { float:right; margin-left:0; color:#645d54; letter-spacing:0.04em; }
        .studio-kicker .studio-total.over { color:#a8431b; }
        .studio-state-list { overflow:hidden; border:1px solid #dcd4c6; border-radius:9px; background:#fbf8f2; }
        .studio-state-shell { border-bottom:1px solid #ded7ca; }
        .studio-state-shell:last-child { border-bottom:0; }
        .studio-state { width:100%; min-height:58px; display:grid; grid-template-columns:25px minmax(0,1fr) auto; align-items:center; gap:6px; border:0; border-bottom:1px solid #ded7ca; background:transparent; color:var(--bdb-ink); padding:8px 12px; text-align:left; cursor:pointer; }
        .studio-state-shell > .studio-state { border-bottom:0; }
        .studio-state:hover { background:#f3ecdf; }
        .studio-state:focus-visible { outline:3px solid var(--studio-accent); outline-offset:-3px; }
        .studio-state:disabled { cursor:wait; opacity:0.7; }
        .studio-state.selected { background:var(--studio-accent); color:var(--studio-base); }
        .studio-state-num { font-size:0.84rem; font-weight:700; }
        .studio-state-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.78rem; font-weight:800; }
        .studio-state-time { font-size:0.64rem; font-weight:700; opacity:0.75; }
        .studio-sequence-toggle { border-top:1px solid #ded7ca; background:#f5efe4; }
        .studio-sequence-toggle.empty { border-top:0; }
        .studio-sequence-toggle > summary { cursor:pointer; list-style:none; padding:10px 12px; color:#5f574d; font-size:0.7rem; font-weight:850; }
        .studio-sequence-toggle > summary::-webkit-details-marker { display:none; }
        .studio-sequence-toggle > summary::before { content:"+"; display:inline-grid; width:18px; height:18px; margin-right:7px; place-items:center; border:1px solid #bcb2a3; border-radius:5px; background:#fbf8f2; }
        .studio-sequence-toggle[open] > summary::before { content:"-"; }
        .studio-sequence-picker { display:grid; gap:9px; border-top:1px solid #ded7ca; padding:11px; }
        .studio-picker-label { color:#6b6257; font-size:0.62rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .studio-picker-select { width:100%; min-width:0; border:1px solid #cfc5b6; border-radius:7px; background:#fff; color:var(--bdb-ink); padding:9px 7px; font-size:0.72rem; font-weight:750; }
        .studio-picker-description { display:grid; grid-template-columns:auto auto 1fr; align-items:center; gap:6px; color:#6d6458; font-size:0.64rem; font-weight:800; }
        .studio-picker-description p { grid-column:1 / -1; margin:2px 0 0; font-size:0.68rem; font-weight:650; line-height:1.35; }
        .studio-picker-dot { width:9px; height:9px; border-radius:3px; }
        .studio-picker-schedule { justify-self:end; border-radius:999px; background:#e8d9b5; color:#68501d; padding:3px 6px; }
        .studio-picker-warning { margin:0; color:#8f341f; font-size:0.67rem; font-weight:750; line-height:1.35; }
        .studio-picker-actions { display:grid; grid-template-columns:1fr; gap:7px; }
        .studio-picker-button { min-height:36px; border:1px solid #74695d; border-radius:7px; background:#fff; color:var(--bdb-ink); padding:6px 8px; font-size:0.68rem; font-weight:850; cursor:pointer; }
        .studio-picker-button.primary { border-color:#bf3e1f; background:#d34a24; color:#fff; }
        .studio-picker-button:disabled { cursor:not-allowed; opacity:0.45; }
        .studio-picker-note { margin:0; color:#83796d; font-size:0.62rem; line-height:1.35; }
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
        .studio-spinner-preview { width:100%; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; text-align:left; }
        .studio-spinner-preview.single { max-width:420px; grid-template-columns:1fr; }
        .studio-spinner-preview.compact { max-width:100%; gap:6px; }
        .studio-spinner-preview.compact .studio-spinner-reel { grid-template-rows:auto minmax(34px,auto) auto; gap:5px; border-radius:7px; padding:7px; }
        .studio-spinner-preview.compact .studio-spinner-reel strong { font-size:0.58rem; }
        .studio-spinner-preview.compact .studio-spinner-reel span { padding:6px; font-size:0.68rem; }
        .studio-spinner-reel { min-width:0; display:grid; grid-template-rows:auto minmax(70px,1fr) auto; gap:9px; border:1px solid var(--studio-line-dark); border-top:4px solid var(--studio-accent); border-radius:10px; background:color-mix(in srgb,var(--studio-panel) 90%,transparent); padding:13px; }
        .studio-spinner-reel p { margin:0; color:var(--studio-accent); font-size:0.58rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .studio-spinner-reel strong { align-self:center; color:#fff; font-size:0.88rem; line-height:1.25; }
        .studio-spinner-reel span { overflow:hidden; border:1px solid var(--studio-line-dark); border-radius:8px; background:var(--studio-base); padding:11px; color:#fff; text-align:center; text-overflow:ellipsis; white-space:nowrap; font-size:1.05rem; font-weight:900; }
        .studio-paper-grid { width:100%; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; text-align:left; }
        .studio-paper-item { border:1px solid var(--studio-line-dark); border-left:4px solid var(--studio-accent); border-radius:8px; background:color-mix(in srgb,var(--studio-panel) 90%,transparent); padding:11px 13px; }
        .studio-paper-label { margin:0 0 5px; color:var(--studio-accent); font-size:0.58rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .studio-paper-body { margin:0; color:white; font-size:0.82rem; font-weight:700; line-height:1.35; white-space:pre-wrap; }
        .studio-routine-grid { width:100%; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; text-align:left; }
        .studio-routine-grid.small-group { max-width:850px; grid-template-columns:minmax(180px,0.7fr) minmax(0,1.6fr); }
        .studio-routine-card { display:grid; align-content:center; gap:7px; border:1px solid var(--studio-line-dark); border-top:4px solid var(--studio-accent); border-radius:9px; background:color-mix(in srgb,var(--studio-panel) 90%,transparent); padding:12px 14px; }
        .studio-routine-card.feature { grid-column:1 / -1; grid-template-columns:1fr auto; align-items:end; }
        .studio-routine-card.task { min-height:140px; }
        .studio-routine-card p { margin:0; color:var(--studio-accent); font-size:0.58rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .studio-routine-card strong { color:#fff; font-size:1.05rem; }
        .studio-routine-card span { color:#fff; font-size:0.78rem; font-weight:720; line-height:1.35; }
        .studio-lower { display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-top:15px; }
        .studio-pace-screen, .studio-student-screen { min-height:245px; }
        .studio-pace-screen { display:grid; align-content:center; justify-items:center; gap:11px; padding:27px; text-align:center; }
        .studio-pace-direction { max-width:24ch; margin:0; color:white; font-size:clamp(1.1rem,2vw,1.55rem); font-weight:850; line-height:1.18; text-wrap:balance; }
        .studio-pace-time { color:var(--studio-accent); font-size:clamp(2.8rem,5.2vw,4.4rem); font-weight:900; line-height:0.9; font-variant-numeric:tabular-nums; letter-spacing:-0.05em; }
        .studio-pace-bars { width:min(100%,330px); height:86px; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); align-items:end; gap:7px; }
        .studio-pace-bar { display:grid; grid-template-rows:minmax(0,1fr) auto; gap:4px; height:100%; align-items:end; color:#fff; font-size:0.62rem; font-weight:900; }
        .studio-pace-bar i { display:block; width:100%; border-radius:5px 5px 2px 2px; background:var(--studio-accent); opacity:0.84; }
        .studio-support-line { max-width:100%; border:1px solid var(--studio-line-dark); border-radius:7px; background:color-mix(in srgb,var(--studio-panel) 90%,transparent); padding:8px 13px; color:white; font-size:0.74rem; font-weight:750; }
        .studio-vocab { display:flex; flex-wrap:wrap; justify-content:center; gap:7px; }
        .studio-vocab span { border-radius:999px; background:var(--studio-accent); color:var(--studio-base); padding:5px 10px; font-size:0.64rem; font-weight:900; }
        .studio-student-screen { border:1px solid #ddd4c5; background:radial-gradient(circle at 84% 12%,color-mix(in srgb,var(--studio-accent) 11%,transparent),transparent 40%),#fbf7ee; color:var(--bdb-ink); }
        .studio-student-top { height:38px; display:flex; align-items:center; gap:8px; border-bottom:1px solid #e5dccd; background:rgba(255,255,255,0.54); padding:0 12px; font-size:0.65rem; font-weight:800; }
        .studio-student-time { margin-left:auto; color:var(--bdb-ink); font-size:0.72rem; font-variant-numeric:tabular-nums; font-weight:900; }
        .studio-student-dot { width:9px; height:9px; border-radius:2px; background:var(--studio-accent); }
        .studio-student-body { min-height:205px; display:grid; align-content:center; justify-items:center; gap:14px; padding:22px; text-align:center; }
        .studio-student-round { margin:0; color:color-mix(in srgb,var(--studio-accent) 78%,#7a2c18); font-size:0.64rem; font-weight:900; letter-spacing:0.11em; text-transform:uppercase; }
        .studio-student-action { max-width:33ch; margin:0; color:var(--bdb-ink); font-size:clamp(0.95rem,1.7vw,1.22rem); font-weight:850; line-height:1.25; white-space:pre-wrap; text-wrap:balance; }
        .studio-student-support { max-width:100%; border:1px solid #d9cebc; border-radius:999px; background:#efe7d8; padding:7px 13px; color:#3e3931; font-size:0.7rem; font-weight:800; }
        .studio-student-support-grid { width:100%; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; text-align:left; }
        .studio-student-support-card { border:1px solid #d9cebc; border-top:3px solid var(--studio-accent); border-radius:7px; background:#fff; padding:8px; }
        .studio-student-support-card strong { display:block; margin-bottom:3px; color:color-mix(in srgb,var(--studio-accent) 72%,#4b4033); font-size:0.55rem; letter-spacing:0.08em; text-transform:uppercase; }
        .studio-student-support-card span { color:#4c453c; font-size:0.63rem; font-weight:750; line-height:1.3; }
        .studio-fist { display:grid; grid-template-columns:repeat(6,30px); gap:5px; }
        .studio-fist span { display:grid; place-items:center; aspect-ratio:1; border:1px solid #d8cebd; border-radius:7px; background:white; font-size:0.72rem; font-weight:850; }
        .studio-response-preview { width:min(100%,430px); display:grid; gap:8px; }
        .studio-response-question { margin:0; color:#5f574d; font-size:0.76rem; font-weight:750; line-height:1.35; }
        .studio-response-input { min-height:54px; border:1px solid #d8cebd; border-radius:8px; background:#fff; padding:10px; color:#80776b; text-align:left; font-size:0.72rem; font-weight:700; }
        .studio-response-send { justify-self:end; border-radius:7px; background:var(--studio-accent); color:var(--studio-base); padding:8px 13px; font-size:0.68rem; font-weight:900; }
        .studio-response-choices { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
        .studio-response-choice { border:1px solid #d8cebd; border-radius:8px; background:#fff; padding:8px 10px; color:#3f3931; font-size:0.7rem; font-weight:800; text-align:left; }
        .studio-form-action { border:1px solid color-mix(in srgb,var(--studio-accent) 55%,#c8bda9); border-radius:8px; background:var(--studio-accent); color:var(--studio-base); padding:9px 15px; font-size:0.72rem; font-weight:900; }
        .studio-remote-wrap { margin-top:17px; border-top:1px solid #ddd4c6; padding-top:17px; }
        .studio-remote { min-height:150px; display:grid; grid-template-columns:minmax(0,1.35fr) minmax(180px,0.7fr); gap:22px; border:1px solid #d9d0c2; border-radius:11px; background:linear-gradient(145deg,#eee8dc,#f8f4ec); padding:14px; }
        .studio-remote-title { margin:0 0 8px; color:#655e53; font-size:0.58rem; font-weight:900; letter-spacing:0.12em; text-transform:uppercase; }
        .studio-speaker-notes { display:grid; gap:5px; margin:0; padding-left:1.1rem; color:var(--bdb-ink); font-size:0.76rem; font-weight:750; line-height:1.38; }
        .studio-speaker-notes li { padding-left:2px; }
        .studio-speaker-notes li::marker { color:var(--studio-accent); }
        .studio-remote-controls { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
        .studio-remote-key { min-height:34px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #d7cec0; border-radius:7px; background:white; padding:0 13px; color:var(--bdb-ink); font-size:0.66rem; font-weight:850; }
        .studio-remote-key.active { border-color:var(--studio-accent); background:color-mix(in srgb,var(--studio-accent) 12%,white); }
        .studio-remote-private { display:grid; align-content:center; gap:9px; border-left:1px solid #ddd4c6; padding-left:22px; }
        .studio-private-note { margin:0; color:#6a6258; font-size:0.69rem; font-weight:700; line-height:1.4; }
        .studio-private-plan { display:grid; gap:7px; margin:0; }
        .studio-private-plan div { display:grid; gap:2px; }
        .studio-private-plan dt { color:var(--studio-accent); font-size:0.56rem; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; }
        .studio-private-plan dd { margin:0; color:#5f574d; font-size:0.66rem; font-weight:720; line-height:1.3; }
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
        .studio-story-tools { display:grid; gap:10px; margin-top:10px; border:1px solid #d8cfc1; border-radius:9px; background:#fffaf0; padding:11px; }
        .studio-story-head { display:flex; align-items:start; justify-content:space-between; gap:12px; }
        .studio-story-title { margin:0; color:#5e5549; font-size:0.68rem; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; }
        .studio-story-note { max-width:58ch; margin:4px 0 0; color:#766e63; font-size:0.68rem; line-height:1.35; }
        .studio-story-head > span { flex:none; border-radius:999px; background:#e9dfce; color:#5f574d; padding:4px 8px; font-size:0.62rem; font-weight:900; }
        .studio-story-list { display:grid; gap:7px; }
        .studio-story-item { display:grid; grid-template-columns:64px minmax(0,1fr) auto; align-items:center; gap:9px; border:1px solid #ded4c5; border-radius:7px; background:#fff; padding:6px; }
        .studio-story-item img { display:block; width:64px; aspect-ratio:16 / 9; border-radius:5px; object-fit:cover; }
        .studio-story-item span { min-width:0; overflow:hidden; color:#5e574e; text-overflow:ellipsis; white-space:nowrap; font-size:0.68rem; font-weight:750; }
        .studio-story-item button { min-height:32px; border:1px solid #c9bdaa; border-radius:6px; background:#fff; color:#7b392c; padding:0 9px; font-size:0.64rem; font-weight:850; cursor:pointer; }
        .studio-story-actions { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:7px; align-items:center; }
        .studio-story-actions .studio-source-action { min-height:40px; }
        .studio-story-message { margin:0; color:#695f52; font-size:0.67rem; font-weight:700; line-height:1.35; }
        .studio-source-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:6px; }
        .studio-source-note { margin:0; color:#766e63; font-size:0.68rem; font-weight:650; line-height:1.35; }
        .studio-source-action { min-height:44px; flex:0 0 auto; border:1px solid #b99a60; border-radius:7px; background:#fffaf0; color:#72551c; padding:0 11px; font-size:0.68rem; font-weight:800; cursor:pointer; }
        .studio-source-action:focus-visible { outline:3px solid var(--studio-accent); outline-offset:2px; }
        .studio-source-action:disabled { cursor:not-allowed; opacity:0.5; }
        .studio-input { width:100%; border:1px solid #d8cfc1; border-radius:7px; background:rgba(255,255,255,0.78); color:var(--bdb-ink); padding:10px 11px; font-size:0.78rem; font-weight:650; line-height:1.45; }
        textarea.studio-input { min-height:76px; resize:vertical; }
        textarea.studio-input.large { min-height:112px; }
        .studio-input:focus { outline:2px solid color-mix(in srgb,var(--studio-accent) 42%,transparent); outline-offset:1px; border-color:var(--studio-accent); }
        .studio-duration { width:102px; }
        .studio-check { display:flex; align-items:flex-start; gap:9px; color:var(--bdb-ink); font-size:0.76rem; font-weight:700; line-height:1.4; }
        .studio-check input { margin-top:2px; accent-color:var(--studio-accent); }
        .studio-link-toggle { margin-top:15px; border:1px solid #d8cfc1; border-radius:8px; background:#fffaf0; padding:11px; }
        .studio-link-toggle small { display:block; margin-top:3px; color:#766e63; font-size:0.66rem; font-weight:650; }
        .studio-field-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
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
          .studio-story-actions { grid-template-columns:1fr 1fr; }
          .studio-story-actions .studio-input { grid-column:1 / -1; }
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
          <p className="studio-kicker">
            Lesson states <span>{lesson?.steps.length || 0}</span>
            {lesson ? <span className={`studio-total${lessonTotalMinutes > 55 ? " over" : ""}`}>{lessonTotalMinutes} min</span> : null}
          </p>
          <div className="studio-state-list">
            {(lesson?.steps || []).map((step, index) => (
              <div className="studio-state-shell" key={step.id}>
                <button
                  className={`studio-state${step.id === selectedStepId ? " selected" : ""}`}
                  type="button"
                  disabled={saveState === "saving" || sequenceChangeState !== "idle"}
                  onClick={() => chooseStep(step.id)}
                >
                  <span className="studio-state-num">{index + 1}</span>
                  <span className="studio-state-name">{stepLabel(step)}</span>
                  <span className="studio-state-time">{Math.max(1, step.duration || 1)} min</span>
                </button>
                {step.id === selectedStepId && (
                  <details className="studio-sequence-toggle">
                    <summary>Replace or add a state</summary>
                    {sequencePicker}
                  </details>
                )}
              </div>
            ))}
            {lesson && lesson.steps.length === 0 && (
              <details className="studio-sequence-toggle empty" open>
                <summary>Add the first state</summary>
                {sequencePicker}
              </details>
            )}
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
                  <span className="studio-screen-time">{previewTimer}</span>
                </div>
                {showLessonVisual ? (
                  <LessonVisual visual={showLessonVisual} variant="studio" accent={theme.accent} />
                ) : isReaderSpinner || isIpadKidSpinner ? (
                  publicSpinnerPreview()
                ) : isLearningCheck ? (
                  <div className="studio-target">
                    {lesson.learningIntention && <div className="studio-target-intention">{lesson.learningIntention}</div>}
                    <div className="studio-target-criterion">{selectedCriterion}</div>
                  </div>
                ) : galleryWalkConfig ? (
                  <div className="studio-routine-grid">
                    <article className="studio-routine-card feature">
                      <p>Gallery Walk</p>
                      <strong>{galleryWalkConfig.stationCount} stations</strong>
                      <span>{galleryWalkConfig.rotationMinutes} minutes at each station</span>
                    </article>
                    <article className="studio-routine-card">
                      <p>Notice</p>
                      <span>{galleryWalkConfig.observationPrompt}</span>
                    </article>
                    <article className="studio-routine-card">
                      <p>Record</p>
                      <span>{galleryWalkConfig.recordPrompt}</span>
                    </article>
                    <article className="studio-routine-card">
                      <p>Move</p>
                      <span>{galleryWalkConfig.movementDirections}</span>
                    </article>
                  </div>
                ) : smallGroupConfig ? (
                  <div className="studio-routine-grid small-group">
                    <article className="studio-routine-card feature">
                      <p>Small Group Rotations</p>
                      <strong>{smallGroupConfig.rotationMinutes} minute rotations</strong>
                    </article>
                    <article className="studio-routine-card task">
                      <p>Group task</p>
                      <span>{smallGroupConfig.publicTask}</span>
                    </article>
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
                    {isDiscussion && <p className="studio-round">{previewDiscussionRound.label}</p>}
                    <div className="studio-main-copy">{mainBody}</div>
                  </div>
                )}
              </section>

              <div className="studio-lower">
                <div>
                  <p className="studio-preview-label">Pace + Support - public</p>
                  <section className="studio-screen studio-pace-screen" aria-label="Pace and Support preview">
                    {publicSurfacesLinked && (isReaderSpinner || isIpadKidSpinner)
                      ? publicSpinnerPreview(true)
                      : isLearningCheck
                        ? (
                          <>
                            <h2 className="studio-pace-direction">Anonymous Fist-to-Five bars after reveal</h2>
                            <div className="studio-pace-bars" aria-label="Anonymous result-bar preview">
                              {[24, 38, 52, 76, 92, 64].map((height, value) => (
                                <span className="studio-pace-bar" key={value}><i style={{ height: `${height}%` }} />{value}</span>
                              ))}
                            </div>
                          </>
                        )
                        : <h2 className="studio-pace-direction">{paceBody}</h2>}
                    <div className="studio-pace-time">{previewTimer}</div>
                    {isDiscussion && stems[0] && <div className="studio-support-line">{stems[0]}</div>}
                    {isDiscussion && vocabulary.length > 0 && (
                      <div className="studio-vocab">{vocabulary.map((word) => <span key={word}>{word}</span>)}</div>
                    )}
                  </section>
                </div>

                <div>
                  <p className="studio-preview-label">Student Chromebook - public</p>
                  <section className="studio-screen studio-student-screen" aria-label="Student Chromebook preview">
                    <div className="studio-student-top">
                      <span className="studio-student-dot" />
                      <span>{stepLabel(selectedStep)}</span>
                      <span className="studio-student-time">{previewTimer}</span>
                    </div>
                    <div className="studio-student-body">
                      {publicSurfacesLinked && (isReaderSpinner || isIpadKidSpinner) ? publicSpinnerPreview(true) : (
                        <>
                          {isDiscussion && <p className="studio-student-round">{previewDiscussionRound.label}</p>}
                          <p className="studio-student-action">{studentBody}</p>
                          {effectiveResponseKind ? (
                            <div className="studio-response-preview" aria-label={`${effectiveResponseKind} response preview`}>
                              {draft.question.trim() && draft.question.trim() !== studentBody.trim() ? (
                                <p className="studio-response-question">{draft.question}</p>
                              ) : null}
                              {effectiveResponseKind === "fist-to-five" ? (
                                <div className="studio-fist" aria-label="Fist to Five preview">
                                  {[0, 1, 2, 3, 4, 5].map((value) => <span key={value}>{value}</span>)}
                                </div>
                              ) : effectiveResponseKind === "multiple-choice" ? (
                                <div className="studio-response-choices">
                                  {normalizedChoices.map((choice) => <span className="studio-response-choice" key={choice}>{choice}</span>)}
                                </div>
                              ) : (
                                <>
                                  <div className="studio-response-input">Type your response</div>
                                  <span className="studio-response-send">Send response</span>
                                </>
                              )}
                            </div>
                          ) : assignedResourceLink ? (
                            <div className={selectedStep.stateId === "warmup" || selectedStep.stateId === "exit" ? "studio-form-action" : "studio-student-support"}>
                              {selectedStep.stateId === "warmup" || selectedStep.stateId === "exit"
                                ? "Open assigned Google Form"
                                : isAssignedTool
                                  ? "Open assigned tool"
                                  : "Open lesson resource"}
                            </div>
                          ) : isDiscussion && stems[0] ? (
                            <div className="studio-student-support">{stems[0]}</div>
                          ) : isAssignedTool && hasAssignedToolResource ? (
                            <div className="studio-student-support">
                              {assignedToolRoute ? `Assigned tool: ${draft.tool.trim()}` : "Open assigned resource"}
                            </div>
                          ) : null}
                          {studentIndependentSupports.length > 0 ? (
                            <div className="studio-student-support-grid">
                              {studentIndependentSupports.map((item) => (
                                <div className="studio-student-support-card" key={item.label}>
                                  <strong>{item.label}</strong>
                                  <span>{item.body}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  </section>
                </div>
              </div>

              <div className="studio-remote-wrap">
                <p className="studio-preview-label">iPad Remote - private</p>
                <section className="studio-remote" aria-label="Private iPad Remote preview">
                  <div>
                    <p className="studio-remote-title">Speaker notes</p>
                    <ul className="studio-speaker-notes" aria-label="Private speaker notes">
                      {remoteSpeakerNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
                    </ul>
                    <div className="studio-remote-controls" aria-hidden="true">
                      {isDiscussion ? (
                        <>
                          {DISCUSSION_ROUNDS.map((round, index) => (
                            <span className={`studio-remote-key${index === 0 ? " active" : ""}`} key={round.id}>{round.buttonLabel}</span>
                          ))}
                          <span className="studio-remote-key">Previous round</span>
                          <span className="studio-remote-key">Start or resume</span>
                          <span className="studio-remote-key">Restart round</span>
                          <span className="studio-remote-key">Next round</span>
                          <span className="studio-remote-key">Choose sharer</span>
                        </>
                      ) : (
                        <>
                          <span className="studio-remote-key">Back</span>
                          <span className="studio-remote-key active">Pause</span>
                          <span className="studio-remote-key">Next</span>
                          <span className="studio-remote-key">Write on screen</span>
                        </>
                      )}
                    </div>
                  </div>
                  <aside className="studio-remote-private">
                    <p className="studio-remote-title">Private teacher surface</p>
                    {smallGroupConfig ? (
                      <dl className="studio-private-plan">
                        <div><dt>Pull</dt><dd>{smallGroupConfig.teacherPlan.pull}</dd></div>
                        <div><dt>Focus</dt><dd>{smallGroupConfig.teacherPlan.focus}</dd></div>
                        <div><dt>Activity</dt><dd>{smallGroupConfig.teacherPlan.activity}</dd></div>
                        <div><dt>Check</dt><dd>{smallGroupConfig.teacherPlan.check}</dd></div>
                      </dl>
                    ) : galleryWalkConfig ? (
                      <p className="studio-private-note">Materials: {galleryWalkConfig.materials.join(", ") || "Add materials below."}</p>
                    ) : (
                      <p className="studio-private-note">The Remote layout stays the same. Only these state-specific actions and private data change.</p>
                    )}
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
          {criterionValidationMessage && (
            <div className="studio-alert error" role="alert">
              {criterionValidationMessage} Studio will not save lesson states, add or replace states, or start this lesson until it is fixed.
            </div>
          )}
          {responseValidationMessage && <div className="studio-alert error" role="alert">{responseValidationMessage}</div>}
          {assignedToolValidationMessage && <div className="studio-alert error" role="alert">{assignedToolValidationMessage}</div>}
          {routineValidationMessage && <div className="studio-alert error" role="alert">{routineValidationMessage}</div>}

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

              <label className="studio-check studio-link-toggle">
                <input
                  type="checkbox"
                  checked={draft.publicSurfaceMode === "linked"}
                  onChange={(event) => updateDraft("publicSurfaceMode", event.target.checked ? "linked" : "split")}
                />
                <span>
                  Show the main focus on all three public screens.
                  <small>Student response boxes and assigned resources still take priority on Chromebooks.</small>
                </span>
              </label>

              <label className="studio-field">
                <span className="studio-label">Main Display (projector prompt)<span className="studio-count">{mainEditorText.length}</span></span>
                <textarea
                  className="studio-input large"
                  disabled={mainScreenUsesStructuredLayout || isCloseout}
                  maxLength={2000}
                  value={mainEditorText}
                  onFocus={() => beginSurfaceEdit("mainDisplay", mainEditorText)}
                  onBlur={() => endSurfaceEdit("mainDisplay")}
                  onChange={(event) => updateSurfaceField("mainDisplay", event.target.value, mainText)}
                />
              </label>
              <section className="studio-story-tools" aria-label="Lesson story images" hidden={!canUseStoryImages}>
                <div className="studio-story-head">
                  <div>
                    <p className="studio-story-title">Launch story images</p>
                    <p className="studio-story-note">Add up to three images for the lesson launch. The scoreboard and prompt stay visible.</p>
                  </div>
                  <span>{configuredStoryImages.length} / 3</span>
                </div>
                {configuredStoryImages.length > 0 ? (
                  <div className="studio-story-list">
                    {configuredStoryImages.map((image) => (
                      <div className="studio-story-item" key={image.url}>
                        <img src={image.url} alt={image.alt} />
                        <span>{image.alt}</span>
                        <button type="button" onClick={() => removeStoryImage(image.url)}>Remove</button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="studio-story-actions">
                  <input
                    className="studio-input"
                    type="url"
                    value={storyImageUrl}
                    placeholder="Paste a public image address"
                    onChange={(event) => setStoryImageUrl(event.target.value)}
                  />
                  <button
                    className="studio-source-action"
                    type="button"
                    disabled={!storyImageUrl.trim() || configuredStoryImages.length >= 3}
                    onClick={() => addStoryImage(storyImageUrl, "Lesson story image")}
                  >
                    Add address
                  </button>
                </div>
                {storyImageMessage ? <p className="studio-story-message" role="status">{storyImageMessage}</p> : null}
              </section>
              {isCloseout ? (
                <div className="studio-source-row">
                  <p className="studio-source-note">Closeout stays cleanup-only on every public screen.</p>
                </div>
              ) : mainScreenUsesStructuredLayout ? (
                <div className="studio-source-row">
                  <p className="studio-source-note">This state uses the structured layout shown in the Main projector preview.</p>
                </div>
              ) : mainText.source ? (
                <div className="studio-source-row">
                  <p className="studio-source-note">{mainText.isOverride ? "Custom screen-specific text." : `Using ${mainText.source}. Edit this box to create a screen-specific version.`}</p>
                  {mainText.isOverride && mainText.inheritedText && (
                    <button className="studio-source-action" type="button" onClick={() => useInheritedSurfaceText("mainDisplay")}>Use inherited text</button>
                  )}
                </div>
              ) : null}

              <label className="studio-field">
                <span className="studio-label">Pace Directions<span className="studio-count">{paceEditorText.length}</span></span>
                <textarea
                  className="studio-input"
                  disabled={isCloseout}
                  maxLength={2000}
                  value={paceEditorText}
                  onFocus={() => beginSurfaceEdit("paceDirections", paceEditorText)}
                  onBlur={() => endSurfaceEdit("paceDirections")}
                  onChange={(event) => updateSurfaceField("paceDirections", event.target.value, paceText)}
                />
              </label>
              {!isCloseout && paceText.source && (
                <div className="studio-source-row">
                  <p className="studio-source-note">{paceText.isOverride ? "Custom screen-specific text." : `Using ${paceText.source}. Edit this box to create a screen-specific version.`}</p>
                  {paceText.isOverride && paceText.inheritedText && (
                    <button className="studio-source-action" type="button" onClick={() => useInheritedSurfaceText("paceDirections")}>Use inherited text</button>
                  )}
                </div>
              )}

              <label className="studio-field">
                <span className="studio-label">Student Action (Chromebook)<span className="studio-count">{studentEditorText.length}</span></span>
                <textarea
                  className="studio-input"
                  disabled={isCloseout}
                  maxLength={2000}
                  value={studentEditorText}
                  onFocus={() => beginSurfaceEdit("studentAction", studentEditorText)}
                  onBlur={() => endSurfaceEdit("studentAction")}
                  onChange={(event) => updateSurfaceField("studentAction", event.target.value, studentText)}
                />
              </label>
              {!isCloseout && studentText.source && (
                <div className="studio-source-row">
                  <p className="studio-source-note">{studentText.isOverride ? "Custom screen-specific text." : `Using ${studentText.source}. Edit this box to create a screen-specific version.`}</p>
                  {studentText.isOverride && studentText.inheritedText && (
                    <button className="studio-source-action" type="button" onClick={() => useInheritedSurfaceText("studentAction")}>Use inherited text</button>
                  )}
                </div>
              )}

              <label className="studio-field">
                <span className="studio-label">Response Mode</span>
                <select className="studio-input" value={draft.responseMode} onChange={(event) => updateDraft("responseMode", event.target.value)}>
                  {RESPONSE_MODES.map((mode) => <option value={mode} key={mode || "blank"}>{mode || "Not set"}</option>)}
                </select>
              </label>

              <label className="studio-field">
                <span className="studio-label">Remote Actions<span className="studio-count">{remoteEditorText.length}</span></span>
                <textarea
                  className="studio-input"
                  maxLength={2000}
                  value={remoteEditorText}
                  onFocus={() => beginSurfaceEdit("remoteActions", remoteEditorText)}
                  onBlur={() => endSurfaceEdit("remoteActions")}
                  onChange={(event) => updateSurfaceField("remoteActions", event.target.value, remoteText)}
                />
              </label>
              {remoteText.source && (
                <div className="studio-source-row">
                  <p className="studio-source-note">{remoteText.isOverride ? "Custom screen-specific text." : `Using ${remoteText.source}. Edit this box to create a screen-specific version.`}</p>
                  {remoteText.isOverride && remoteText.inheritedText && (
                    <button className="studio-source-action" type="button" onClick={() => useInheritedSurfaceText("remoteActions")}>Use inherited text</button>
                  )}
                </div>
              )}

              <p className="studio-source-note">Write on screen is always available from the private Remote and opens beside the current main-projector content.</p>

              {isDiscussion && (
                <div className="studio-editor-section">
                  <h2>Discussion supports</h2>
                  <p>Sentence stems and vocabulary appear on the support and student previews.</p>
                  <label className="studio-field">
                    <span className="studio-label">Sentence Stems<span className="studio-count">{splitLines(draft.discussionStems).length}</span></span>
                    <textarea className="studio-input" maxLength={2000} value={discussionStemsEditorText} onChange={(event) => updateDraft("discussionStems", event.target.value)} />
                  </label>
                  <label className="studio-field">
                    <span className="studio-label">Vocabulary (key terms)<span className="studio-count">{splitVocabulary(draft.vocabulary).length}</span></span>
                    <textarea className="studio-input" maxLength={2000} value={vocabularyEditorText} onChange={(event) => updateDraft("vocabulary", event.target.value)} />
                  </label>
                </div>
              )}

              {galleryWalkConfig && (
                <div className="studio-editor-section">
                  <h2>Gallery Walk configuration</h2>
                  <p>Set the movement and thinking routine once. The three public screens format it for their own roles.</p>
                  <div className="studio-field-row">
                    <label className="studio-field">
                      <span className="studio-label">Stations</span>
                      <input className="studio-input" type="number" min={1} max={20} value={galleryWalkConfig.stationCount} onChange={(event) => updateDraft("routineConfig", { ...galleryWalkConfig, stationCount: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} />
                    </label>
                    <label className="studio-field">
                      <span className="studio-label">Minutes per rotation</span>
                      <input className="studio-input" type="number" min={0.5} max={60} step={0.5} value={galleryWalkConfig.rotationMinutes} onChange={(event) => updateDraft("routineConfig", { ...galleryWalkConfig, rotationMinutes: Math.max(0.5, Math.min(60, Number(event.target.value) || 0.5)) })} />
                    </label>
                  </div>
                  {([
                    ["movementDirections", "Movement directions"],
                    ["observationPrompt", "What to notice"],
                    ["recordPrompt", "What to record"],
                    ["sharePrompt", "Share-out prompt"],
                  ] as const).map(([field, label]) => (
                    <label className="studio-field" key={field}>
                      <span className="studio-label">{label}</span>
                      <textarea className="studio-input" maxLength={800} value={galleryWalkConfig[field]} onChange={(event) => updateDraft("routineConfig", { ...galleryWalkConfig, [field]: event.target.value })} />
                    </label>
                  ))}
                  <label className="studio-field">
                    <span className="studio-label">Materials (one per line)</span>
                    <textarea className="studio-input" maxLength={2000} value={galleryWalkConfig.materials.join("\n")} onChange={(event) => updateDraft("routineConfig", { ...galleryWalkConfig, materials: splitLines(event.target.value) })} />
                  </label>
                </div>
              )}

              {smallGroupConfig && (
                <div className="studio-editor-section">
                  <h2>Small Group configuration</h2>
                  <p>The group task is public. Pull, focus, activity, check, and materials stay on the private teacher Remote.</p>
                  <label className="studio-field">
                    <span className="studio-label">Minutes per rotation</span>
                    <input className="studio-input studio-duration" type="number" min={0.5} max={60} step={0.5} value={smallGroupConfig.rotationMinutes} onChange={(event) => updateDraft("routineConfig", { ...smallGroupConfig, rotationMinutes: Math.max(0.5, Math.min(60, Number(event.target.value) || 0.5)) })} />
                  </label>
                  <label className="studio-field">
                    <span className="studio-label">Public group task</span>
                    <textarea className="studio-input" maxLength={800} value={smallGroupConfig.publicTask} onChange={(event) => updateDraft("routineConfig", { ...smallGroupConfig, publicTask: event.target.value })} />
                  </label>
                  {([
                    ["pull", "Private pull plan"],
                    ["focus", "Private focus"],
                    ["activity", "Private activity"],
                    ["check", "Private check"],
                  ] as const).map(([field, label]) => (
                    <label className="studio-field" key={field}>
                      <span className="studio-label">{label}</span>
                      <textarea className="studio-input" maxLength={800} value={smallGroupConfig.teacherPlan[field]} onChange={(event) => updateDraft("routineConfig", { ...smallGroupConfig, teacherPlan: { ...smallGroupConfig.teacherPlan, [field]: event.target.value } })} />
                    </label>
                  ))}
                  <label className="studio-field">
                    <span className="studio-label">Private materials (one per line)</span>
                    <textarea className="studio-input" maxLength={2000} value={smallGroupConfig.teacherPlan.materials.join("\n")} onChange={(event) => updateDraft("routineConfig", { ...smallGroupConfig, teacherPlan: { ...smallGroupConfig.teacherPlan, materials: splitLines(event.target.value) } })} />
                  </label>
                </div>
              )}

              {(effectiveResponseKind || draft.question || responseModeNeedsQuestion) && (
                <div className="studio-editor-section">
                  <h2>Response prompt</h2>
                  <p>{effectiveResponseKind ? `Response type: ${effectiveResponseKind}` : "This prompt is used by the selected lesson state."}</p>
                  <label className="studio-field">
                    <span className="studio-label">Question<span className="studio-count">{draft.question.length}</span></span>
                    <textarea className="studio-input" maxLength={2000} value={draft.question} onChange={(event) => updateDraft("question", event.target.value)} />
                  </label>
                  {effectiveResponseKind === "multiple-choice" && (
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
