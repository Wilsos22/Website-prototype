export type ClassroomStageId =
  | "evergreen"
  | "scenario"
  | "concrete"
  | "representational"
  | "abstract"
  | "learning-check"
  | "discussion"
  | "independent"
  | "exit"
  | "closeout";

export interface ClassroomStageTheme {
  id: ClassroomStageId;
  label: string;
  accent: string;
  projectorBase: string;
  projectorPanel: string;
  projectorLine: string;
  projectorMuted: string;
  projectorGlow: string;
}

export const CLASSROOM_STAGE_THEMES: Record<ClassroomStageId, ClassroomStageTheme> = {
  evergreen: {
    id: "evergreen",
    label: "Warm-up and review",
    accent: "#6fbd91",
    projectorBase: "#0c1d17",
    projectorPanel: "#132a20",
    projectorLine: "#2f5a46",
    projectorMuted: "#aac7b7",
    projectorGlow: "rgba(69, 142, 103, 0.32)",
  },
  scenario: {
    id: "scenario",
    label: "Lesson launch",
    accent: "#d59a55",
    projectorBase: "#21150d",
    projectorPanel: "#302016",
    projectorLine: "#68452d",
    projectorMuted: "#d4b99e",
    projectorGlow: "rgba(181, 111, 49, 0.3)",
  },
  concrete: {
    id: "concrete",
    label: "Concrete model",
    accent: "#69b17f",
    projectorBase: "#0d1c13",
    projectorPanel: "#14271b",
    projectorLine: "#31583d",
    projectorMuted: "#b2cbb9",
    projectorGlow: "rgba(55, 132, 78, 0.32)",
  },
  representational: {
    id: "representational",
    label: "Representational model",
    accent: "#58b8b4",
    projectorBase: "#0b1d1f",
    projectorPanel: "#10292b",
    projectorLine: "#2d5b5c",
    projectorMuted: "#acd0cf",
    projectorGlow: "rgba(52, 145, 142, 0.3)",
  },
  abstract: {
    id: "abstract",
    label: "Abstract reasoning",
    accent: "#8291e8",
    projectorBase: "#11152b",
    projectorPanel: "#191f3b",
    projectorLine: "#3d4778",
    projectorMuted: "#b8c0e2",
    projectorGlow: "rgba(86, 101, 190, 0.34)",
  },
  "learning-check": {
    id: "learning-check",
    label: "Learning check",
    accent: "#d2a74f",
    projectorBase: "#241329",
    projectorPanel: "#321a38",
    projectorLine: "#68446d",
    projectorMuted: "#d4bdd8",
    projectorGlow: "rgba(130, 68, 140, 0.34)",
  },
  discussion: {
    id: "discussion",
    label: "Discussion",
    accent: "#cf6b42",
    projectorBase: "#27130d",
    projectorPanel: "#351b13",
    projectorLine: "#713c2a",
    projectorMuted: "#dbb5a5",
    projectorGlow: "rgba(170, 70, 35, 0.32)",
  },
  independent: {
    id: "independent",
    label: "Independent paper work",
    accent: "#6f91c6",
    projectorBase: "#0d1829",
    projectorPanel: "#14233a",
    projectorLine: "#334d72",
    projectorMuted: "#b5c5da",
    projectorGlow: "rgba(62, 94, 145, 0.34)",
  },
  exit: {
    id: "exit",
    label: "Exit ticket",
    accent: "#c9687c",
    projectorBase: "#281018",
    projectorPanel: "#371721",
    projectorLine: "#723647",
    projectorMuted: "#dab6bf",
    projectorGlow: "rgba(159, 55, 80, 0.34)",
  },
  closeout: {
    id: "closeout",
    label: "Closeout",
    accent: "#d1a64d",
    projectorBase: "#21190d",
    projectorPanel: "#2e2414",
    projectorLine: "#634f2c",
    projectorMuted: "#d5c39f",
    projectorGlow: "rgba(169, 125, 42, 0.3)",
  },
};

export function inferClassroomStage(stateId: string | null | undefined, label = ""): ClassroomStageId {
  const value = `${stateId || ""} ${label}`.toLowerCase();
  if (value.includes("warm") || value.includes("review")) return "evergreen";
  if (value.includes("learning-check") || value.includes("midlesson") || value.includes("fist") || value.includes("poll")) return "learning-check";
  if (value.includes("represent")) return "representational";
  if (value.includes("abstract")) return "abstract";
  if (value.includes("concrete") || value.includes("manip")) return "concrete";
  if (value.includes("discussion") || value.includes("partner") || value.includes("group")) return "discussion";
  if (value.includes("independent") || value.includes("you-do") || value.includes("you do")) return "independent";
  if (value.includes("exit")) return "exit";
  if (value.includes("closeout") || value.includes("clean") || value.includes("pack")) return "closeout";
  return "scenario";
}

export function classroomStageTheme(stateId: string | null | undefined, label = ""): ClassroomStageTheme {
  return CLASSROOM_STAGE_THEMES[inferClassroomStage(stateId, label)];
}
