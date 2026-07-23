export interface LessonVisualQuantity {
  label: string;
  count: number;
  color: string;
  unit: string;
}

export interface LessonStoryImage {
  url: string;
  alt: string;
  caption?: string;
}

export type LessonScoreboardStage = "halftime" | "final";
export type LessonScoreboardTeams = [{ label: string; score: number }, { label: string; score: number }];

export function scoreboardTeamsForStage(
  teams: LessonScoreboardTeams,
  stage: LessonScoreboardStage,
): LessonScoreboardTeams {
  if (stage !== "final") return teams;
  return teams.map((team) => ({ ...team, score: team.score * 2 })) as LessonScoreboardTeams;
}

export type LessonVisual =
  | {
      kind: "scoreboard";
      teams: LessonScoreboardTeams;
      situation: string;
      prompt: string;
      storyImages?: LessonStoryImage[];
    }
  | {
      kind: "storyboard";
      images: LessonStoryImage[];
      situation: string;
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
      kind: "area-model";
      factorA: number;
      factorB: number;
      split: [number, number] | null;
      expression: string;
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
const STORY_IMAGE_PATTERN = /!\[([^\]]*)\]\(((?:https?:\/\/|\/)[^)]+)\)/gi;
const MAX_VISUAL_QUANTITY = 1000;
const MAX_SCORE = 100000;

const CRUSADERS_HALFTIME_STORY: LessonStoryImage[] = [
  {
    url: "/lesson-visuals/m2-t1-l1-halftime-scoreboard.jpg",
    alt: "Gym scoreboard showing the Crusaders leading the Blue Jays 30 to 20 at halftime",
    caption: "Halftime: Crusaders lead 30 to 20",
  },
  {
    url: "/lesson-visuals/m2-t1-l1-final-score-prediction.jpg",
    alt: "Gym scoreboard with question marks for both teams at the end of the game",
    caption: "End of game: what will the score be?",
  },
];

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

// The distributive-property lessons keep the area model on screen as the
// scaffold even while the words move toward the equation: any step text that
// names an a x b product earns a figure. A split like "(10 + 6)" or
// "into 10 + 6" draws the partition.
const AREA_MODEL_LESSONS = /^M1\.T1\.L1(?:-|$)/i;
const AREA_MODEL_SKIP_STATES = new Set(["warmup", "closeout", "exit", "learning-check"]);
const AREA_FACTORS_PATTERN = /\b(\d{1,2})\s*[x\u00d7]\s*(\d{1,3})\b/i;
const AREA_SPLIT_PATTERN = /\(\s*(\d{1,3})\s*\+\s*(\d{1,3})\s*\)|\b(?:into|as)\s+(\d{1,3})\s*\+\s*(\d{1,3})\b/i;

function resolveAreaModelVisual(
  lessonCode: string | undefined,
  stateId: string,
  candidates: string[],
): LessonVisual | null {
  if (!AREA_MODEL_LESSONS.test((lessonCode || "").trim())) return null;
  if (AREA_MODEL_SKIP_STATES.has(stateId)) return null;
  for (const text of candidates) {
    const factors = text.match(AREA_FACTORS_PATTERN);
    if (!factors) continue;
    let factorA = Number(factors[1]);
    let factorB = Number(factors[2]);
    if (!Number.isSafeInteger(factorA) || !Number.isSafeInteger(factorB)) continue;
    if (factorA < 2 || factorA > 30 || factorB < 2 || factorB > 400) continue;
    let split: [number, number] | null = null;
    const splitMatch = text.match(AREA_SPLIT_PATTERN);
    if (splitMatch) {
      const first = Number(splitMatch[1] ?? splitMatch[3]);
      const second = Number(splitMatch[2] ?? splitMatch[4]);
      if (Number.isSafeInteger(first) && Number.isSafeInteger(second)) {
        if (first + second === factorB) split = [first, second];
        else if (first + second === factorA) {
          const swapped = factorA;
          factorA = factorB;
          factorB = swapped;
          split = [first, second];
        }
      }
    }
    return {
      kind: "area-model",
      factorA,
      factorB,
      split,
      expression: `${factorA} \u00d7 ${factorB}`,
      prompt: "",
    };
  }
  return null;
}

export function lessonStoryImages(text: string): LessonStoryImage[] {
  const images: LessonStoryImage[] = [];
  STORY_IMAGE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(STORY_IMAGE_PATTERN)) {
    const url = match[2]?.trim();
    if (!url || images.some((image) => image.url === url)) continue;
    images.push({
      url,
      alt: match[1]?.trim() || "Lesson story image",
    });
  }
  return images;
}

export function stripLessonStoryImages(text: string): string {
  STORY_IMAGE_PATTERN.lastIndex = 0;
  return normalizeLessonVisualText(text.replace(STORY_IMAGE_PATTERN, " "));
}

export function lessonStoryImageMarkup(url: string, alt = "Lesson story image"): string {
  const safeAlt = alt.replace(/[\[\]\r\n]+/g, " ").replace(/\s+/g, " ").trim() || "Lesson story image";
  return `![${safeAlt}](${url.trim()})`;
}

export function removeLessonStoryImage(text: string, url: string): string {
  STORY_IMAGE_PATTERN.lastIndex = 0;
  return text
    .replace(STORY_IMAGE_PATTERN, (markup, _alt: string, candidateUrl: string) => (
      candidateUrl.trim() === url.trim() ? " " : markup
    ))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function storyCopy(text: string): { situation: string; prompt: string } {
  const normalized = stripLessonStoryImages(text);
  const firstSentence = normalized.match(/^(.+?[.!?])(?:\s+|$)(.*)$/);
  if (!firstSentence) return { situation: normalized, prompt: "What do you predict will happen next?" };
  return {
    situation: firstSentence[1].trim(),
    prompt: firstSentence[2].trim() || "What do you predict will happen next?",
  };
}

function builtInScoreboardStory(
  firstTeam: string,
  firstScore: number,
  secondTeam: string,
  secondScore: number,
): LessonStoryImage[] | undefined {
  return firstTeam.trim().toLowerCase() === "crusaders"
    && secondTeam.trim().toLowerCase() === "blue jays"
    && firstScore === 30
    && secondScore === 20
    ? CRUSADERS_HALFTIME_STORY
    : undefined;
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

function mentionsVisualQuantities(text: string): boolean {
  QUANTITY_PATTERN.lastIndex = 0;
  return QUANTITY_PATTERN.test(text);
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
  const stateId = input.stateId.trim().toLowerCase();
  const primaryText = normalizeLessonVisualText(input.text);
  const contextSteps = typeof input.currentStepIndex === "number"
    ? (input.contextSteps || []).slice(0, Math.max(0, input.currentStepIndex))
    : input.contextSteps || [];
  const candidates = [input.text, ...(input.fallbackTexts || [])]
    .map(normalizeLessonVisualText)
    .filter(Boolean);
  const importedImages = candidates.flatMap(lessonStoryImages).filter((image, index, images) => (
    images.findIndex((candidate) => candidate.url === image.url) === index
  ));

  const areaModel = resolveAreaModelVisual(input.lessonCode, stateId, candidates);
  if (areaModel) return areaModel;

  if (importedImages.length && (stateId === "launch" || stateId === "scenario")) {
    for (const candidate of candidates) {
      const cleanCandidate = stripLessonStoryImages(candidate);
      const match = cleanCandidate.match(SCOREBOARD_PATTERN);
      if (!match) continue;
      const firstScore = Number(match[3]);
      const secondScore = Number(match[4]);
      if (!Number.isSafeInteger(firstScore) || !Number.isSafeInteger(secondScore)) continue;
      const matchedPrompt = cleanCandidate
        .slice(match[0].length)
        .replace(/^[\s.!?;:-]+/, "")
        .trim();
      return {
        kind: "scoreboard",
        teams: [
          { label: match[1].trim(), score: firstScore },
          { label: match[2].trim(), score: secondScore },
        ],
        situation: `${match[1].trim()} lead the ${match[2].trim()} ${firstScore} to ${secondScore} at halftime.`,
        prompt: matchedPrompt || "Predict the final score and explain your reasoning.",
        storyImages: importedImages.slice(0, 3),
      };
    }
    const copy = storyCopy(primaryText || candidates[0] || "");
    return {
      kind: "storyboard",
      images: importedImages.slice(0, 3),
      ...copy,
    };
  }

  if (!supportsLessonVisuals(input.lessonCode)) return null;

  // Keep the approved M2.T1.L1 visual available when the exact scoreboard
  // statement is present, including lesson-day suffixes.
  if (stateId === "launch" || stateId === "scenario") {
    for (const candidate of candidates) {
      const match = candidate.match(SCOREBOARD_PATTERN);
      if (!match) continue;
      const firstScore = Number(match[3]);
      const secondScore = Number(match[4]);
      const storyImages = builtInScoreboardStory(match[1], firstScore, match[2], secondScore);
      if (!storyImages) continue;
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
        situation: `${match[1].trim()} lead the ${match[2].trim()} ${firstScore} to ${secondScore} at halftime.`,
        prompt: primaryText && primaryText !== candidate ? primaryText : matchedPrompt || candidate,
        storyImages,
      };
    }
  }

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
        situation: `${match[1].trim()} lead the ${match[2].trim()} ${firstScore} to ${secondScore} at halftime.`,
        prompt: primaryText && primaryText !== candidate ? primaryText : matchedPrompt || candidate,
        storyImages: builtInScoreboardStory(
          match[1],
          firstScore,
          match[2],
          secondScore,
        ),
      };
    }
    if (candidates.some((candidate) => SCOREBOARD_PATTERN.test(candidate))) return null;
    return {
      kind: "scoreboard",
      teams: [
        { label: "Team Gold", score: 20 },
        { label: "Team Blue", score: 30 },
      ],
      situation: "Team Gold trails Team Blue 20 to 30 at halftime.",
      prompt: primaryText || "Did the relationship between the scores stay the same?",
    };
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
    if (candidates.some(mentionsVisualQuantities)) return null;
    return {
      kind: "quantity-model",
      mode: stateId === "concrete" ? "counters" : "tiles",
      quantities: [
        { label: "yellow", count: 3, color: quantityColor("yellow"), unit: stateId === "concrete" ? "counters" : "tiles" },
        { label: "blue", count: 2, color: quantityColor("blue"), unit: stateId === "concrete" ? "counters" : "tiles" },
      ],
      total: stateId === "concrete" ? 5 : undefined,
      prompt: primaryText || "Make 3 yellow for every 2 blue.",
    };
  }

  if (stateId === "abstract") {
    const comparisonSource = candidates.find((candidate) => requestedComparisons(candidate).length > 0);
    const quantities = firstQuantityContext(contextSteps);
    if (!comparisonSource || !quantities) {
      const fallbackQuantities: [LessonVisualQuantity, LessonVisualQuantity] = [
        { label: "yellow", count: 3, color: quantityColor("yellow"), unit: "tiles" },
        { label: "blue", count: 2, color: quantityColor("blue"), unit: "tiles" },
      ];
      return {
        kind: "ratio-forms",
        quantities: fallbackQuantities,
        comparisons: [{ left: "yellow", right: "blue", numerator: 3, denominator: 2 }],
        prompt: primaryText || "Write the yellow-to-blue ratio three ways.",
      };
    }
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
    if (!comparisons.length) {
      return {
        kind: "ratio-forms",
        quantities,
        comparisons: [{
          left: quantities[0].label,
          right: quantities[1].label,
          numerator: quantities[0].count,
          denominator: quantities[1].count,
        }],
        prompt: primaryText || comparisonSource,
      };
    }
    return {
      kind: "ratio-forms",
      quantities,
      comparisons,
      prompt: primaryText || comparisonSource,
    };
  }

  return null;
}
