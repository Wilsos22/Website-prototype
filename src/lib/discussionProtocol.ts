export type DiscussionPhaseId = "think" | "marker" | "table" | "revise" | "share";

export type CanonicalDiscussionRoundId = "think" | "table" | "share";

export interface DiscussionRoundDefinition {
  id: CanonicalDiscussionRoundId;
  roundNumber: 1 | 2 | 3;
  label: string;
  buttonLabel: string;
  subtitle: string;
  defaultSeconds: 120;
  visual: string;
  spinner: boolean;
  remoteAction: "discussion-think" | "discussion-discuss" | "discussion-share";
}

export interface DiscussionPhaseSnapshot {
  id: DiscussionPhaseId;
  label: string;
  subtitle: string;
  timed: boolean;
  totalSeconds: number | null;
  secondsLeft: number | null;
  running: boolean;
  finished: boolean;
  media: {
    url: string;
    type: "image" | "video" | "embed";
  } | null;
  sentenceStems?: string[];
  keyVocabulary?: string[];
  selectedSharer?: string | null;
  roundNumber?: 1 | 2 | 3;
  roundCount?: 3;
}

export const DISCUSSION_ROUND_COUNT = 3 as const;
export const DISCUSSION_ROUND_SECONDS = 120 as const;
export const DISCUSSION_TOTAL_SECONDS = DISCUSSION_ROUND_COUNT * DISCUSSION_ROUND_SECONDS;

export const DISCUSSION_ROUNDS: readonly DiscussionRoundDefinition[] = [
  {
    id: "think",
    roundNumber: 1,
    label: "Round 1 of 3: Think + Write",
    buttonLabel: "Round 1: Think + Write",
    subtitle: "Think quietly, then write your first idea.",
    defaultSeconds: DISCUSSION_ROUND_SECONDS,
    visual: "01",
    spinner: false,
    remoteAction: "discussion-think",
  },
  {
    id: "table",
    roundNumber: 2,
    label: "Round 2 of 3: Discuss + Revise",
    buttonLabel: "Round 2: Discuss + Revise",
    subtitle: "Use the stems and vocabulary, then strengthen your response.",
    defaultSeconds: DISCUSSION_ROUND_SECONDS,
    visual: "02",
    spinner: false,
    remoteAction: "discussion-discuss",
  },
  {
    id: "share",
    roundNumber: 3,
    label: "Round 3 of 3: Share",
    buttonLabel: "Round 3: Share",
    subtitle: "Use the spinner, then listen and respond.",
    defaultSeconds: DISCUSSION_ROUND_SECONDS,
    visual: "03",
    spinner: true,
    remoteAction: "discussion-share",
  },
] as const;

export function canonicalDiscussionRoundId(
  phaseId: DiscussionPhaseId | string | null | undefined,
): CanonicalDiscussionRoundId {
  if (phaseId === "marker") return "think";
  if (phaseId === "revise") return "table";
  if (phaseId === "table" || phaseId === "share") return phaseId;
  return "think";
}

export function discussionRoundForPhase(
  phaseId: DiscussionPhaseId | string | null | undefined,
): DiscussionRoundDefinition {
  const canonicalId = canonicalDiscussionRoundId(phaseId);
  return DISCUSSION_ROUNDS.find((round) => round.id === canonicalId) || DISCUSSION_ROUNDS[0];
}

export function discussionRoundIndex(
  phaseId: DiscussionPhaseId | string | null | undefined,
): number {
  const canonicalId = canonicalDiscussionRoundId(phaseId);
  return Math.max(0, DISCUSSION_ROUNDS.findIndex((round) => round.id === canonicalId));
}

export function nextDiscussionRound(
  phaseId: DiscussionPhaseId | string | null | undefined,
): DiscussionRoundDefinition | null {
  return DISCUSSION_ROUNDS[discussionRoundIndex(phaseId) + 1] || null;
}

export function discussionRoundCompletesState(
  phaseId: DiscussionPhaseId | string | null | undefined,
): boolean {
  return nextDiscussionRound(phaseId) === null;
}

export function discussionRoundForAction(action: string | null | undefined): DiscussionRoundDefinition | null {
  if (action === "discussion-think" || action === "discussion-write") return DISCUSSION_ROUNDS[0];
  if (action === "discussion-discuss" || action === "discussion-revise") return DISCUSSION_ROUNDS[1];
  if (action === "discussion-share") return DISCUSSION_ROUNDS[2];
  return null;
}

export function createDiscussionRoundSnapshot(
  phaseId: DiscussionPhaseId | string | null | undefined = "think",
  running = false,
): DiscussionPhaseSnapshot {
  const round = discussionRoundForPhase(phaseId);
  return {
    id: round.id,
    label: round.label,
    subtitle: round.subtitle,
    timed: true,
    totalSeconds: round.defaultSeconds,
    secondsLeft: round.defaultSeconds,
    running,
    finished: false,
    media: null,
    roundNumber: round.roundNumber,
    roundCount: DISCUSSION_ROUND_COUNT,
  };
}

export function normalizeDiscussionPhaseSnapshot(
  snapshot: DiscussionPhaseSnapshot | null | undefined,
): DiscussionPhaseSnapshot | null {
  if (!snapshot) return null;
  const round = discussionRoundForPhase(snapshot.id);
  const secondsLeft = typeof snapshot.secondsLeft === "number"
    ? Math.max(0, Math.min(round.defaultSeconds, snapshot.secondsLeft))
    : round.defaultSeconds;
  const finished = Boolean(snapshot.finished || secondsLeft <= 0);
  return {
    ...snapshot,
    id: round.id,
    label: round.label,
    subtitle: round.subtitle,
    timed: true,
    totalSeconds: round.defaultSeconds,
    secondsLeft,
    running: Boolean(snapshot.running && !finished),
    finished,
    selectedSharer: round.spinner ? snapshot.selectedSharer || null : null,
    roundNumber: round.roundNumber,
    roundCount: DISCUSSION_ROUND_COUNT,
  };
}
