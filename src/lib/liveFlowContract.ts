export type LivePollKind = "short-answer" | "multiple-choice" | "fist-to-five";

export const LIVE_RESPONSE_MODES = [
  "None",
  "Google Form",
  "Paper",
  "Short Answer",
  "Multiple Choice",
  "Fist to Five",
  "Assigned Tool",
  "Physical Response",
] as const;

export type LiveResponseMode = (typeof LIVE_RESPONSE_MODES)[number];

export function liveResponseModePollKind(responseMode: string | undefined): LivePollKind | null {
  const normalized = responseMode?.trim().toLowerCase();
  if (normalized === "short answer") return "short-answer";
  if (normalized === "multiple choice") return "multiple-choice";
  if (normalized === "fist to five") return "fist-to-five";
  return null;
}

const ASSIGNED_TOOL_ROUTES: Record<string, string> = {
  whiteboard: "/whiteboard",
  numberline: "/number-line-plus",
  doublenumberline: "/number-line-plus",
  numberlineplus: "/number-line-plus",
  percentbar: "/percent-bar",
  equationbuilder: "/equation-builder",
  gems: "/order-of-operations",
  orderofoperations: "/order-of-operations",
  fractionbars: "/fraction-bars",
  algebratiles: "/algebra-tiles",
  areamodel: "/area-model",
  areaexplorer: "/area-explorer",
  areaofshapes: "/area-explorer",
  combineliketerms: "/combine-like-terms",
  combiningliketerms: "/combine-like-terms",
  laddermethod: "/ladder-method",
  ladder: "/ladder-method",
  proportions: "/proportions",
  groupbars: "/group-bars",
  coordinategrid: "/coordinate-grid",
  coordinateplane: "/coordinate-grid",
  termidentifier: "/term-identifier",
  multiplicationfacts: "/multiplication-fluency",
  multiplicationfluency: "/multiplication-fluency",
  balancebeam: "/balance-beam",
  distributivearea: "/distributive-area",
};

export function liveAssignedToolRoute(toolName: string | undefined): string | null {
  if (!toolName) return null;
  const normalized = toolName.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^bigdogmath/, "");
  return ASSIGNED_TOOL_ROUTES[normalized] || null;
}

export function splitLiveFlowLines(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n+/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
}

export function splitLiveFlowVocabulary(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(/[\n,;]+/).map((word) => word.trim()).filter(Boolean);
}
