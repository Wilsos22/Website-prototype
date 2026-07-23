// Slide overlays: teacher-placed decorations rendered above the
// auto-generated projector slide. Stored as JSON in the Lesson Step's
// "Slide Overlay" Notion property and carried through the live-flow
// snapshot's sequence steps. Positions and sizes are percentages of the
// slide stage, so an overlay scales to any display.

export type SlideOverlayElementType =
  | "text"
  | "equation"
  | "rect"
  | "circle"
  | "line"
  | "arrow"
  | "image";

export interface SlideOverlayElement {
  id: string;
  type: SlideOverlayElementType;
  // Box elements (text, equation, rect, circle, image): top-left corner + size.
  // Line and arrow: x/y is the start point, x2/y2 the end point.
  x: number;
  y: number;
  w?: number;
  h?: number;
  x2?: number;
  y2?: number;
  text?: string;
  color?: string;
  // Font size as a percentage of stage height, so text scales with the room.
  size?: number;
  thickness?: number;
  fill?: boolean;
  url?: string;
}

export interface SlideOverlayData {
  v: 1;
  elements: SlideOverlayElement[];
}

const MAX_ELEMENTS = 40;
const MAX_TEXT = 400;
const MAX_URL = 1000;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function sanitizeElement(raw: unknown): SlideOverlayElement | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const type = candidate.type;
  if (
    type !== "text" && type !== "equation" && type !== "rect" && type !== "circle"
    && type !== "line" && type !== "arrow" && type !== "image"
  ) return null;
  const element: SlideOverlayElement = {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id.slice(0, 40) : Math.random().toString(36).slice(2, 10),
    type,
    x: clampNumber(candidate.x, -20, 120, 40),
    y: clampNumber(candidate.y, -20, 120, 40),
  };
  if (candidate.w != null) element.w = clampNumber(candidate.w, 1, 100, 20);
  if (candidate.h != null) element.h = clampNumber(candidate.h, 1, 100, 12);
  if (candidate.x2 != null) element.x2 = clampNumber(candidate.x2, -20, 120, 60);
  if (candidate.y2 != null) element.y2 = clampNumber(candidate.y2, -20, 120, 60);
  if (typeof candidate.text === "string") element.text = candidate.text.slice(0, MAX_TEXT);
  if (typeof candidate.color === "string") element.color = candidate.color.slice(0, 24);
  if (candidate.size != null) element.size = clampNumber(candidate.size, 1.5, 30, 6);
  if (candidate.thickness != null) element.thickness = clampNumber(candidate.thickness, 1, 24, 4);
  if (candidate.fill != null) element.fill = Boolean(candidate.fill);
  if (typeof candidate.url === "string") element.url = candidate.url.slice(0, MAX_URL);
  return element;
}

export function parseSlideOverlay(raw: string | null | undefined): SlideOverlayData | null {
  const text = (raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as { v?: unknown; elements?: unknown };
    if (!parsed || !Array.isArray(parsed.elements)) return null;
    const elements = parsed.elements
      .slice(0, MAX_ELEMENTS)
      .map(sanitizeElement)
      .filter((element): element is SlideOverlayElement => element !== null);
    if (!elements.length) return null;
    return { v: 1, elements };
  } catch {
    return null;
  }
}

export function serializeSlideOverlay(data: SlideOverlayData): string {
  if (!data.elements.length) return "";
  return JSON.stringify({ v: 1, elements: data.elements.slice(0, MAX_ELEMENTS) });
}

// The overlay palette mirrors the Warm Notebook tokens.
export const SLIDE_OVERLAY_COLORS = [
  { name: "Ink", value: "#201e1a" },
  { name: "Head", value: "#2E4A54" },
  { name: "Teal", value: "#50a3a4" },
  { name: "Amber", value: "#fcaf38" },
  { name: "Coral", value: "#f95335" },
  { name: "Green", value: "#2f9e6f" },
  { name: "Brown", value: "#674a40" },
  { name: "White", value: "#ffffff" },
] as const;

// Minimal math tokenizer for the equation element: {a}/{b} becomes a stacked
// fraction, ^{...} or ^x a superscript, letters render italic. Enough for
// sixth grade - x squared, three fourths, 4(10 + 6).
export type EquationToken =
  | { kind: "plain"; text: string }
  | { kind: "variable"; text: string }
  | { kind: "super"; text: string }
  | { kind: "fraction"; numerator: string; denominator: string };

export function tokenizeEquation(text: string): EquationToken[] {
  const tokens: EquationToken[] = [];
  let rest = text;
  const push = (segment: string) => {
    let plain = "";
    for (const ch of segment) {
      if (/[a-z]/i.test(ch)) {
        if (plain) { tokens.push({ kind: "plain", text: plain }); plain = ""; }
        tokens.push({ kind: "variable", text: ch });
      } else {
        plain += ch;
      }
    }
    if (plain) tokens.push({ kind: "plain", text: plain });
  };
  while (rest.length) {
    const fraction = rest.match(/^\{([^}]{1,24})\}\s*\/\s*\{([^}]{1,24})\}/);
    if (fraction) {
      tokens.push({ kind: "fraction", numerator: fraction[1], denominator: fraction[2] });
      rest = rest.slice(fraction[0].length);
      continue;
    }
    const superscript = rest.match(/^\^(?:\{([^}]{1,12})\}|(\S))/);
    if (superscript) {
      tokens.push({ kind: "super", text: superscript[1] ?? superscript[2] });
      rest = rest.slice(superscript[0].length);
      continue;
    }
    const nextSpecial = rest.slice(1).search(/\{|\^/);
    const take = nextSpecial === -1 ? rest.length : nextSpecial + 1;
    push(rest.slice(0, take));
    rest = rest.slice(take);
  }
  return tokens;
}
