const NOTION_TEXT_LIMIT = 2_000;
const ROUTINE_MARKER_PREFIX = "BDM_ROUTINE_CONFIG:";
const ROUTINE_MARKER_LINE_PATTERN = /^\[BDM_ROUTINE_CONFIG:([A-Za-z0-9_-]+)\]$/;
const TRAILING_CREATE_TOKEN_PATTERN = /(?:\r?\n){0,2}(\[BDM_CREATE_TOKEN:[A-Za-z0-9_-]{16,100}\])\s*$/;

const BASE64_URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const MAX_STATIONS = 20;
const MAX_ROTATION_MINUTES = 60;
const MAX_TEXT_LENGTH = 800;
const MAX_MATERIALS = 24;
const MAX_MATERIAL_LENGTH = 160;

export type LessonRoutineKind = "gallery-walk" | "small-group";

export interface GalleryWalkRoutineConfig {
  kind: "gallery-walk";
  stationCount: number;
  rotationMinutes: number;
  movementDirections: string;
  observationPrompt: string;
  recordPrompt: string;
  sharePrompt: string;
  materials: string[];
}

export interface SmallGroupTeacherPlan {
  pull: string;
  focus: string;
  activity: string;
  check: string;
  materials: string[];
}

export interface SmallGroupRoutineConfig {
  kind: "small-group";
  rotationMinutes: number;
  publicTask: string;
  teacherPlan: SmallGroupTeacherPlan;
}

export type LessonRoutineConfig = GalleryWalkRoutineConfig | SmallGroupRoutineConfig;

export type PublicLessonRoutineConfig =
  | Omit<GalleryWalkRoutineConfig, "materials">
  | Pick<SmallGroupRoutineConfig, "kind" | "rotationMinutes" | "publicTask">;

export function defaultLessonRoutineConfig(
  stateId: string | null | undefined,
): LessonRoutineConfig | null {
  if (stateId === "gallery-walk") {
    return {
      kind: "gallery-walk",
      stationCount: 4,
      rotationMinutes: 3,
      movementDirections: "Move clockwise when the timer sounds.",
      observationPrompt: "Notice one strategy and one piece of evidence.",
      recordPrompt: "Record one observation at each station.",
      sharePrompt: "Share one idea your group wants to carry forward.",
      materials: ["Station work", "Recording sheet", "Pencil"],
    };
  }
  if (stateId === "small-group") {
    return {
      kind: "small-group",
      rotationMinutes: 8,
      publicTask: "Complete the assigned group task. Show your thinking on paper.",
      teacherPlan: {
        pull: "Choose the students who need the same next move.",
        focus: "Name the specific misconception or strategy to strengthen.",
        activity: "Model one example, then have students try the next.",
        check: "Ask each student to explain the next step before returning.",
        materials: ["Targeted task", "Manipulative as needed"],
      },
    };
  }
  return null;
}

type StoredRoutineConfig =
  | {
      v: 1;
      k: "gallery";
      s: number;
      r: number;
      move: string;
      observe: string;
      record: string;
      share: string;
      materials: string[];
    }
  | {
      v: 1;
      k: "small-group";
      r: number;
      task: string;
      teacher: {
        pull: string;
        focus: string;
        activity: string;
        check: string;
        materials: string[];
      };
    };

export class LessonRoutineConfigError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_ROUTINE_CONFIG"
      | "INVALID_ROUTINE_MARKER"
      | "ROUTINE_CONFIG_TOO_LONG",
  ) {
    super(message);
    this.name = "LessonRoutineConfigError";
  }
}

function configError(message: string): never {
  throw new LessonRoutineConfigError(message, "INVALID_ROUTINE_CONFIG");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedKeys = new Set(allowed);
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknownKey) configError(`${label} contains an unsupported ${unknownKey} field.`);
}

function requiredText(value: unknown, label: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== "string") configError(`${label} must be text.`);
  const normalized = value.trim();
  if (!normalized) configError(`${label} is required.`);
  if (normalized.length > maxLength) configError(`${label} must be ${maxLength} characters or fewer.`);
  return normalized;
}

function positiveNumber(value: unknown, label: string, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > max) {
    configError(`${label} must be greater than 0 and no more than ${max}.`);
  }
  if (integer && !Number.isInteger(value)) configError(`${label} must be a whole number.`);
  return value;
}

function materialList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) configError(`${label} must be a list.`);
  if (value.length > MAX_MATERIALS) configError(`${label} may contain no more than ${MAX_MATERIALS} items.`);
  const materials = value.map((item, index) => requiredText(item, `${label} item ${index + 1}`, MAX_MATERIAL_LENGTH));
  return [...new Set(materials)];
}

function normalizeTeacherPlan(value: unknown): SmallGroupTeacherPlan {
  if (!isRecord(value)) configError("Small Group teacher plan is required.");
  requireExactKeys(value, ["pull", "focus", "activity", "check", "materials"], "Small Group teacher plan");
  return {
    pull: requiredText(value.pull, "Private pull plan"),
    focus: requiredText(value.focus, "Private focus"),
    activity: requiredText(value.activity, "Private activity"),
    check: requiredText(value.check, "Private check"),
    materials: materialList(value.materials, "Private materials"),
  };
}

export function validateLessonRoutineConfig(value: unknown): LessonRoutineConfig {
  if (!isRecord(value)) configError("Lesson routine configuration must be an object.");
  if (value.kind === "gallery-walk") {
    requireExactKeys(
      value,
      [
        "kind",
        "stationCount",
        "rotationMinutes",
        "movementDirections",
        "observationPrompt",
        "recordPrompt",
        "sharePrompt",
        "materials",
      ],
      "Gallery Walk configuration",
    );
    return {
      kind: "gallery-walk",
      stationCount: positiveNumber(value.stationCount, "Station count", MAX_STATIONS, true),
      rotationMinutes: positiveNumber(value.rotationMinutes, "Rotation minutes", MAX_ROTATION_MINUTES),
      movementDirections: requiredText(value.movementDirections, "Movement directions"),
      observationPrompt: requiredText(value.observationPrompt, "Observation prompt"),
      recordPrompt: requiredText(value.recordPrompt, "Record prompt"),
      sharePrompt: requiredText(value.sharePrompt, "Share prompt"),
      materials: materialList(value.materials, "Gallery Walk materials"),
    };
  }

  if (value.kind === "small-group") {
    requireExactKeys(value, ["kind", "rotationMinutes", "publicTask", "teacherPlan"], "Small Group configuration");
    return {
      kind: "small-group",
      rotationMinutes: positiveNumber(value.rotationMinutes, "Rotation minutes", MAX_ROTATION_MINUTES),
      publicTask: requiredText(value.publicTask, "Public task"),
      teacherPlan: normalizeTeacherPlan(value.teacherPlan),
    };
  }

  return configError("Lesson routine kind must be gallery-walk or small-group.");
}

export function publicLessonRoutineConfig(config: LessonRoutineConfig): PublicLessonRoutineConfig {
  const normalized = validateLessonRoutineConfig(config);
  return normalizePublicLessonRoutineConfig(normalized)!;
}

/**
 * Keep only routine fields that are intentionally projected to students.
 * Accepting the full teacher shape makes this a defensive boundary for older
 * live snapshots that may still contain private fields.
 */
export function normalizePublicLessonRoutineConfig(
  config: LessonRoutineConfig | PublicLessonRoutineConfig | null | undefined,
): PublicLessonRoutineConfig | null {
  if (!config) return null;
  if (config.kind === "gallery-walk") {
    return {
      kind: config.kind,
      stationCount: config.stationCount,
      rotationMinutes: config.rotationMinutes,
      movementDirections: config.movementDirections,
      observationPrompt: config.observationPrompt,
      recordPrompt: config.recordPrompt,
      sharePrompt: config.sharePrompt,
    };
  }
  return {
    kind: config.kind,
    rotationMinutes: config.rotationMinutes,
    publicTask: config.publicTask,
  };
}

function storedRoutineConfig(config: LessonRoutineConfig): StoredRoutineConfig {
  if (config.kind === "gallery-walk") {
    return {
      v: 1,
      k: "gallery",
      s: config.stationCount,
      r: config.rotationMinutes,
      move: config.movementDirections,
      observe: config.observationPrompt,
      record: config.recordPrompt,
      share: config.sharePrompt,
      materials: config.materials,
    };
  }
  return {
    v: 1,
    k: "small-group",
    r: config.rotationMinutes,
    task: config.publicTask,
    teacher: config.teacherPlan,
  };
}

function configFromStored(value: unknown): LessonRoutineConfig {
  if (!isRecord(value) || value.v !== 1 || typeof value.k !== "string") {
    throw new LessonRoutineConfigError("The lesson routine marker has an unsupported format.", "INVALID_ROUTINE_MARKER");
  }
  if (value.k === "gallery") {
    return validateLessonRoutineConfig({
      kind: "gallery-walk",
      stationCount: value.s,
      rotationMinutes: value.r,
      movementDirections: value.move,
      observationPrompt: value.observe,
      recordPrompt: value.record,
      sharePrompt: value.share,
      materials: value.materials,
    });
  }
  if (value.k === "small-group") {
    return validateLessonRoutineConfig({
      kind: "small-group",
      rotationMinutes: value.r,
      publicTask: value.task,
      teacherPlan: value.teacher,
    });
  }
  throw new LessonRoutineConfigError("The lesson routine marker has an unsupported routine kind.", "INVALID_ROUTINE_MARKER");
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += BASE64_URL_ALPHABET[first >> 2];
    encoded += BASE64_URL_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) encoded += BASE64_URL_ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)];
    if (third !== undefined) encoded += BASE64_URL_ALPHABET[third & 63];
  }
  return encoded;
}

function decodeBase64Url(value: string): string {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new LessonRoutineConfigError("The lesson routine marker is not valid.", "INVALID_ROUTINE_MARKER");
  }
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_URL_ALPHABET.indexOf(value[index]);
    const second = BASE64_URL_ALPHABET.indexOf(value[index + 1]);
    const third = index + 2 < value.length ? BASE64_URL_ALPHABET.indexOf(value[index + 2]) : -1;
    const fourth = index + 3 < value.length ? BASE64_URL_ALPHABET.indexOf(value[index + 3]) : -1;
    if (first < 0 || second < 0 || (third < 0 && index + 2 < value.length) || (fourth < 0 && index + 3 < value.length)) {
      throw new LessonRoutineConfigError("The lesson routine marker is not valid.", "INVALID_ROUTINE_MARKER");
    }
    bytes.push((first << 2) | (second >> 4));
    if (third >= 0) bytes.push(((second & 15) << 4) | (third >> 2));
    if (fourth >= 0) bytes.push(((third & 3) << 6) | fourth);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    throw new LessonRoutineConfigError("The lesson routine marker is not valid text.", "INVALID_ROUTINE_MARKER");
  }
}

function routineMarker(config: LessonRoutineConfig): string {
  const payload = encodeBase64Url(JSON.stringify(storedRoutineConfig(config)));
  return `[${ROUTINE_MARKER_PREFIX}${payload}]`;
}

function markerPayloads(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().match(ROUTINE_MARKER_LINE_PATTERN)?.[1] || "")
    .filter(Boolean);
}

export function lessonRoutineConfigFromAiContext(value: string): LessonRoutineConfig | null {
  const payloads = markerPayloads(value);
  if (!payloads.length) return null;
  if (payloads.length > 1) {
    throw new LessonRoutineConfigError("AI Context contains more than one lesson routine marker.", "INVALID_ROUTINE_MARKER");
  }
  try {
    return configFromStored(JSON.parse(decodeBase64Url(payloads[0])) as unknown);
  } catch (error) {
    if (error instanceof LessonRoutineConfigError && error.code === "INVALID_ROUTINE_MARKER") throw error;
    throw new LessonRoutineConfigError("The lesson routine marker could not be read.", "INVALID_ROUTINE_MARKER");
  }
}

export function stripLessonRoutineConfig(value: string): string {
  return value
    .split(/\r?\n/)
    .filter((line) => !ROUTINE_MARKER_LINE_PATTERN.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function withLessonRoutineConfig(
  aiContext: string,
  config: LessonRoutineConfig | null,
  maxLength = NOTION_TEXT_LIMIT,
): string {
  if (typeof aiContext !== "string") configError("AI Context must be text.");
  const createTokenMatch = aiContext.match(TRAILING_CREATE_TOKEN_PATTERN);
  const createTokenMarker = createTokenMatch?.[1] || "";
  const withoutCreateToken = createTokenMatch?.index === undefined
    ? aiContext
    : aiContext.slice(0, createTokenMatch.index);
  const content = stripLessonRoutineConfig(withoutCreateToken).trimEnd();
  const normalizedConfig = config ? validateLessonRoutineConfig(config) : null;
  const combined = [content, normalizedConfig ? routineMarker(normalizedConfig) : "", createTokenMarker]
    .filter(Boolean)
    .join("\n\n");
  if (combined.length > maxLength) {
    throw new LessonRoutineConfigError(
      `AI Context and lesson routine configuration must total ${maxLength.toLocaleString()} characters or fewer.`,
      "ROUTINE_CONFIG_TOO_LONG",
    );
  }
  return combined;
}
