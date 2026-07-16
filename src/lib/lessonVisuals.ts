export interface LessonVisualQuantity {
  label: string;
  count: number;
  color: string;
  unit: string;
}

export type LessonVisual =
  | {
      kind: "scoreboard";
      teams: [{ label: string; score: number }, { label: string; score: number }];
      prompt: string;
    }
  | {
      kind: "quantity-model";
      mode: "counters" | "tiles";
      quantities: [LessonVisualQuantity, LessonVisualQuantity];
      total?: number;
      prompt: string;
    }
  | {
      kind: "ratio-forms";
      quantities: [LessonVisualQuantity, LessonVisualQuantity];
      comparisons: Array<{
        left: string;
        right: string;
        numerator: number;
        denominator: number;
      }>;
      prompt: string;
    };

export interface LessonVisualInput {
  lessonCode?: string;
  stateId: string;
  text: string;
  fallbackTexts?: string[];
  contextSteps?: Array<{ stateId: string; text: string }>;
  currentStepIndex?: number;
}

const COLOR_PATTERN = "blue|yellow|red|white|green|orange|purple|black|gr(?:a|e)y|gold";
const QUANTITY_PATTERN = new RegExp(
  `\\b(\\d+)\\s+(${COLOR_PATTERN})\\s+(counters?|tiles?|parts?|objects?)\\b`,
  "gi",
);
const COMPARISON_PATTERN = new RegExp(
  `\\b(${COLOR_PATTERN})-to-(${COLOR_PATTERN}|whole)\\b`,
  "gi",
);
const SCOREBOARD_PATTERN = /^The\s+(.+?)\s+lead(?:s)?\s+the\s+(.+?)\s+(\d+)\s*(?:to|[-:])\s*(\d+)\s+at\s+halftime\b/i;
const MAX_VISUAL_QUANTITY = 1000;
const MAX_SCORE = 100000;

const QUANTITY_COLORS: Record<string, string> = {
  black: "#2f3437",
  blue: "#6fa8e6",
  gold: "#f5b841",
  gray: "#8c9297",
  green: "#69b17f",
  grey: "#8c9297",
  orange: "#e38b4b",
  purple: "#9b83d8",
  red: "#d9685a",
  white: "#f7f4ed",
  yellow: "#f5b841",
};

export function normalizeLessonVisualText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function supportsLessonVisuals(lessonCode: string | undefined): boolean {
  return /^M2\.T1\.L1(?:-|$)/i.test((lessonCode || "").trim());
}

function quantityColor(label: string): string {
  return QUANTITY_COLORS[label.toLowerCase()] || "#8c9297";
}

function quantitiesFromText(text: string): [LessonVisualQuantity, LessonVisualQuantity] | null {
  const quantities: LessonVisualQuantity[] = [];
  QUANTITY_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(QUANTITY_PATTERN)) {
    const count = Number(match[1]);
    const label = match[2]?.toLowerCase();
    const unit = match[3]?.toLowerCase();
    if (!label || !unit || !Number.isSafeInteger(count) || count <= 0 || count > MAX_VISUAL_QUANTITY) continue;
    quantities.push({ label, count, color: quantityColor(label), unit });
    if (quantities.length === 2) break;
  }
  if (quantities[0]?.label === quantities[1]?.label) return null;
  return quantities.length === 2
    ? [quantities[0], quantities[1]]
    : null;
}

function explicitTotalFromText(text: string): number | null {
  const match = text.match(/\b(\d+)\s+total\s+(?:counters?|tiles?|parts?|objects?)\b/i);
  const total = Number(match?.[1]);
  return Number.isSafeInteger(total) && total > 0 && total <= MAX_VISUAL_QUANTITY ? total : null;
}

function requestedComparisons(text: string): Array<{ left: string; right: string }> {
  const comparisons: Array<{ left: string; right: string }> = [];
  COMPARISON_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(COMPARISON_PATTERN)) {
    const left = match[1]?.toLowerCase();
    const right = match[2]?.toLowerCase();
    if (!left || !right) continue;
    if (!comparisons.some((comparison) => comparison.left === left && comparison.right === right)) {
      comparisons.push({ left, right });
    }
  }
  return comparisons;
}

function firstQuantityContext(
  steps: Array<{ stateId: string; text: string }>,
): [LessonVisualQuantity, LessonVisualQuantity] | null {
  for (const step of [...steps].reverse()) {
    if (!/^(?:concrete|representational)$/i.test(step.stateId)) continue;
    const quantities = quantitiesFromText(normalizeLessonVisualText(step.text));
    if (quantities) return quantities;
  }
  return null;
}

export function resolveLessonVisual(input: LessonVisualInput): LessonVisual | null {
  if (!supportsLessonVisuals(input.lessonCode)) return null;

  const stateId = input.stateId.trim().toLowerCase();
  const primaryText = normalizeLessonVisualText(input.text);
  const contextSteps = typeof input.currentStepIndex === "number"
    ? (input.contextSteps || []).slice(0, Math.max(0, input.currentStepIndex))
    : input.contextSteps || [];
  const candidates = [input.text, ...(input.fallbackTexts || [])]
    .map(normalizeLessonVisualText)
    .filter(Boolean);

  if (stateId === "launch" || stateId === "scenario") {
    for (const candidate of candidates) {
      const match = candidate.match(SCOREBOARD_PATTERN);
      if (!match) continue;
      const firstScore = Number(match[3]);
      const secondScore = Number(match[4]);
      if (
        !Number.isSafeInteger(firstScore)
        || !Number.isSafeInteger(secondScore)
        || firstScore < 0
        || secondScore < 0
        || firstScore > MAX_SCORE
        || secondScore > MAX_SCORE
      ) continue;
      const matchedPrompt = candidate
        .slice(match[0].length)
        .replace(/^[\s.!?;:-]+/, "")
        .trim();
      return {
        kind: "scoreboard",
        teams: [
          { label: match[1].trim(), score: firstScore },
          { label: match[2].trim(), score: secondScore },
        ],
        prompt: primaryText && primaryText !== candidate ? primaryText : matchedPrompt || candidate,
      };
    }
    return null;
  }

  if (stateId === "concrete" || stateId === "representational") {
    for (const candidate of candidates) {
      const quantities = quantitiesFromText(candidate);
      if (!quantities) continue;
      const quantityTotal = quantities[0].count + quantities[1].count;
      const explicitTotal = explicitTotalFromText(candidate);
      return {
        kind: "quantity-model",
        mode: stateId === "concrete" ? "counters" : "tiles",
        quantities,
        total: stateId === "concrete"
          ? quantityTotal
          : explicitTotal === quantityTotal ? explicitTotal : undefined,
        prompt: primaryText || candidate,
      };
    }
    return null;
  }

  if (stateId === "abstract") {
    const comparisonSource = candidates.find((candidate) => requestedComparisons(candidate).length > 0);
    const quantities = firstQuantityContext(contextSteps);
    if (!comparisonSource || !quantities) return null;
    const total = quantities[0].count + quantities[1].count;
    const comparisons = requestedComparisons(comparisonSource).flatMap((comparison) => {
      const leftQuantity = quantities.find((quantity) => quantity.label === comparison.left);
      const rightQuantity = quantities.find((quantity) => quantity.label === comparison.right);
      const denominator = comparison.right === "whole" ? total : rightQuantity?.count;
      if (!leftQuantity || !denominator) return [];
      return [{
        ...comparison,
        numerator: leftQuantity.count,
        denominator,
      }];
    });
    if (!comparisons.length) return null;
    return {
      kind: "ratio-forms",
      quantities,
      comparisons,
      prompt: primaryText || comparisonSource,
    };
  }

  return null;
}
