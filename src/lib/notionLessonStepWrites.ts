import { DEFAULT_STATES, classStateStepDefaults } from "./classStates";
import {
  defaultLessonRoutineConfig,
  lessonRoutineConfigFromAiContext,
  stripLessonRoutineConfig,
  validateLessonRoutineConfig,
  withLessonRoutineConfig,
  type LessonRoutineConfig,
} from "./lessonRoutineConfig";
import {
  isPublicSurfaceMode,
  parseLessonStepAiContext,
  replaceLessonStepAiContextText,
  defaultPublicSurfaceModeForState,
  resolvePublicSurfaceMode,
  setPublicSurfaceMode,
  type PublicSurfaceMode,
} from "./lessonStepMetadata";

const LESSON_DATA_SOURCE_ID = "e367e541-c0c7-4613-8066-d2e61b6fee64";
const LESSON_STEP_DATA_SOURCE_ID = "8e467c1b-8937-4902-811e-ca0a2e15af4d";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const NOTION_TEXT_LIMIT = 2_000;
const NOTION_URL_LIMIT = 2_000;
const CREATE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;
const CREATE_TOKEN_PREFIX = "BDM_CREATE_TOKEN:";
const CREATE_TOKEN_MARKER_PATTERN = /(?:\r?\n){0,2}\[BDM_CREATE_TOKEN:([A-Za-z0-9_-]{16,100})\]\s*$/;

// Notion does not expose an atomic last-edited precondition for page updates.
// Serialize same-step saves within this server instance, then verify the
// authoritative page again after PATCH. The explicit revision check still
// protects normal multi-device edits, while the post-write read detects most
// cross-instance collisions and preserves the caller's draft on conflict.
const stepWriteTails = new Map<string, Promise<void>>();
const lessonWriteTails = new Map<string, Promise<void>>();
const CLASS_STATE_BY_ID = new Map(DEFAULT_STATES.map((state) => [state.id, state]));

const POLL_KINDS = ["", "short-answer", "multiple-choice", "fist-to-five"] as const;
const ADVANCE_MODES = ["", "Automatic", "Manual"] as const;
const RESPONSE_MODES = [
  "",
  "None",
  "Google Form",
  "Paper",
  "Short Answer",
  "Multiple Choice",
  "Multiple Choice + Explain",
  "Fist to Five",
  "Assigned Tool",
  "Physical Response",
] as const;

type PollKind = (typeof POLL_KINDS)[number];
type AdvanceMode = (typeof ADVANCE_MODES)[number];
type ResponseMode = (typeof RESPONSE_MODES)[number];

interface RichTextItem {
  plain_text?: string;
  text?: { content?: string };
}

interface NotionProperty {
  type?: string;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  number?: number | null;
  select?: { name: string } | null;
  checkbox?: boolean;
  url?: string | null;
  relation?: { id: string }[];
}

interface NotionPage {
  id: string;
  archived?: boolean;
  in_trash?: boolean;
  last_edited_time?: string;
  parent?: {
    data_source_id?: string;
    database_id?: string;
  };
  properties: Record<string, NotionProperty>;
}

interface NotionQueryResponse {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
}

export interface EditableLessonStep {
  id: string;
  lessonId: string;
  lastEditedTime: string;
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
  pollKind: PollKind;
  choices: string[];
  correctAnswer: string;
  standard: string;
  aiContext: string;
  publicSurfaceMode: PublicSurfaceMode;
  routineConfig: LessonRoutineConfig | null;
  advance: AdvanceMode;
  required: boolean;
  linkUrl: string;
  mainDisplay: string;
  paceDirections: string;
  studentAction: string;
  remoteActions: string;
  discussionStems: string;
  vocabulary: string;
  responseMode: ResponseMode;
  workSpaceAvailable: boolean;
}

export type LessonStepChanges = Partial<Omit<EditableLessonStep, "id" | "lessonId" | "lastEditedTime">>;

export class LessonStepApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly retryAfter?: string,
    public readonly currentStep?: EditableLessonStep,
  ) {
    super(message);
    this.name = "LessonStepApiError";
  }
}

const TEXT_PROPERTIES = {
  title: { notionName: "Step", type: "title" },
  stateId: { notionName: "State ID", type: "rich_text" },
  studentDirections: { notionName: "Student Directions", type: "rich_text" },
  teacherNotes: { notionName: "Teacher Notes", type: "rich_text" },
  paperTask: { notionName: "Paper Task", type: "rich_text" },
  tool: { notionName: "Tool", type: "rich_text" },
  question: { notionName: "Question", type: "rich_text" },
  correctAnswer: { notionName: "Correct Answer", type: "rich_text" },
  standard: { notionName: "Standard", type: "rich_text" },
  aiContext: { notionName: "AI Context", type: "rich_text" },
  mainDisplay: { notionName: "Main Display", type: "rich_text" },
  paceDirections: { notionName: "Pace Directions", type: "rich_text" },
  studentAction: { notionName: "Student Action", type: "rich_text" },
  remoteActions: { notionName: "Remote Actions", type: "rich_text" },
  discussionStems: { notionName: "Discussion Stems", type: "rich_text" },
  vocabulary: { notionName: "Vocabulary", type: "rich_text" },
  slideOverlay: { notionName: "Slide Overlay", type: "rich_text" },
} as const;

const NUMBER_PROPERTIES = {
  order: { notionName: "Order", min: 0, max: 1_000, integer: true },
  startMinute: { notionName: "Start Minute", min: 0, max: 600, integer: false },
  duration: { notionName: "Duration", min: Number.EPSILON, max: 600, integer: false },
} as const;

const SELECT_PROPERTIES = {
  pollKind: { notionName: "Poll Kind", values: POLL_KINDS },
  advance: { notionName: "Advance", values: ADVANCE_MODES },
  responseMode: { notionName: "Response Mode", values: RESPONSE_MODES },
} as const;

const BOOLEAN_PROPERTIES = {
  required: "Required",
  workSpaceAvailable: "Work Space Available",
} as const;

const EDITABLE_KEYS = new Set<string>([
  ...Object.keys(TEXT_PROPERTIES),
  ...Object.keys(NUMBER_PROPERTIES),
  ...Object.keys(SELECT_PROPERTIES),
  ...Object.keys(BOOLEAN_PROPERTIES),
  "choices",
  "linkUrl",
  "publicSurfaceMode",
  "routineConfig",
]);

function compactNotionId(value: string | undefined): string {
  return (value || "").trim().replace(/-/g, "").toLowerCase();
}

function normalizeNotionPageId(value: unknown, label: string): string {
  const compact = typeof value === "string" ? compactNotionId(value) : "";
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    throw new LessonStepApiError(`${label} must be a valid Notion page ID.`, 400, "INVALID_PAGE_ID");
  }
  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join("-");
}

async function withSerializedStepWrite<T>(stepId: string, task: () => Promise<T>): Promise<T> {
  const previous = stepWriteTails.get(stepId) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  stepWriteTails.set(stepId, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (stepWriteTails.get(stepId) === tail) stepWriteTails.delete(stepId);
  }
}

async function withSerializedLessonWrite<T>(lessonId: string, task: () => Promise<T>): Promise<T> {
  const previous = lessonWriteTails.get(lessonId) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  lessonWriteTails.set(lessonId, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (lessonWriteTails.get(lessonId) === tail) lessonWriteTails.delete(lessonId);
  }
}

function notionToken(): string {
  const token = process.env.NOTION_TOKEN?.trim();
  if (!token) {
    throw new LessonStepApiError("The Notion lesson connection is not configured.", 503, "NOTION_NOT_CONFIGURED");
  }
  return token;
}

function notionHeaders(token: string, withBody = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    ...(withBody ? { "Content-Type": "application/json" } : {}),
  };
}

function notionFailure(status: number, retryAfter: string | null): LessonStepApiError {
  if (status === 404) {
    return new LessonStepApiError("That published lesson step could not be found.", 404, "STEP_NOT_FOUND");
  }
  if (status === 401 || status === 403) {
    return new LessonStepApiError(
      "The Notion connection cannot access the lesson step. Check the integration's content permissions.",
      503,
      "NOTION_ACCESS_REQUIRED",
    );
  }
  if (status === 429) {
    return new LessonStepApiError(
      "Notion is receiving too many requests. Wait briefly, then save again.",
      429,
      "NOTION_RATE_LIMITED",
      retryAfter || undefined,
    );
  }
  if (status === 409) {
    return new LessonStepApiError(
      "Notion reported a conflicting lesson-step update. Reload the step before saving again.",
      409,
      "NOTION_CONFLICT",
    );
  }
  return new LessonStepApiError("Notion could not complete the lesson-step request.", 502, "NOTION_UPSTREAM_ERROR");
}

async function fetchNotionPage(pageId: string): Promise<NotionPage> {
  const response = await fetch(`${NOTION_API}/pages/${pageId}`, {
    headers: notionHeaders(notionToken()),
    cache: "no-store",
  });
  if (!response.ok) throw notionFailure(response.status, response.headers.get("retry-after"));
  const page = await response.json().catch(() => null) as NotionPage | null;
  if (!page?.id || !page.properties || !page.last_edited_time) {
    throw new LessonStepApiError("Notion returned an incomplete lesson-step response.", 502, "NOTION_INVALID_RESPONSE");
  }
  return page;
}

function pageIsDeleted(page: NotionPage): boolean {
  return Boolean(page.archived || page.in_trash);
}

function pageBelongsTo(page: NotionPage, dataSourceId: string): boolean {
  return compactNotionId(page.parent?.data_source_id) === compactNotionId(dataSourceId);
}

function propertyText(property: NotionProperty | undefined): string {
  if (!property) return "";
  const items = property.type === "title" ? property.title : property.rich_text;
  return (items || []).map((item) => item.plain_text ?? item.text?.content ?? "").join("");
}

function propertyNumber(property: NotionProperty | undefined): number {
  return typeof property?.number === "number" && Number.isFinite(property.number) ? property.number : 0;
}

function propertySelect<T extends readonly string[]>(property: NotionProperty | undefined, allowed: T): T[number] {
  const value = property?.select?.name || "";
  return (allowed as readonly string[]).includes(value) ? value as T[number] : "" as T[number];
}

function propertyRelationIds(property: NotionProperty | undefined): string[] {
  return (property?.relation || []).map((relation) => compactNotionId(relation.id)).filter(Boolean);
}

function createTokenMarker(token: string): string {
  return `[${CREATE_TOKEN_PREFIX}${token}]`;
}

function extractCreateToken(value: string): string {
  return value.match(CREATE_TOKEN_MARKER_PATTERN)?.[1] || "";
}

function stripCreateToken(value: string): string {
  return value.replace(CREATE_TOKEN_MARKER_PATTERN, "").trimEnd();
}

function appendCreateToken(value: string, token: string): string {
  const content = stripCreateToken(value);
  return `${content}${content ? "\n\n" : ""}${createTokenMarker(token)}`;
}

function richTextWithCreateToken(value: string, token: string): { rich_text: ReturnType<typeof textValue> } {
  const combined = appendCreateToken(value, token);
  if (combined.length > NOTION_TEXT_LIMIT) {
    throw new LessonStepApiError(
      `AI Context must leave room for its internal create token and stay within ${NOTION_TEXT_LIMIT.toLocaleString()} characters.`,
      400,
      "FIELD_TOO_LONG",
    );
  }
  return { rich_text: textValue(combined) };
}

function validateMutationToken(value: unknown): string {
  if (typeof value !== "string" || !CREATE_TOKEN_PATTERN.test(value.trim())) {
    throw new LessonStepApiError(
      "Start this add action again so it has a valid mutation token.",
      400,
      "INVALID_MUTATION_TOKEN",
    );
  }
  return value.trim();
}

interface RoutineConfigInspection {
  config: LessonRoutineConfig | null;
  invalid: boolean;
}

function inspectRoutineConfigFromRawAiContext(value: string): RoutineConfigInspection {
  try {
    return { config: lessonRoutineConfigFromAiContext(value), invalid: false };
  } catch {
    return { config: null, invalid: true };
  }
}

function invalidRoutineConfigError(): LessonStepApiError {
  return new LessonStepApiError(
    "This lesson step has invalid internal routine configuration. Replace the state or save a complete routine configuration to repair it.",
    409,
    "INVALID_ROUTINE_CONFIG",
  );
}

function mapEditableStep(page: NotionPage, lessonId: string): EditableLessonStep {
  const p = page.properties;
  const stateId = propertyText(p["State ID"]);
  const rawAiContext = propertyText(p["AI Context"]);
  return {
    id: normalizeNotionPageId(page.id, "Step ID"),
    lessonId,
    lastEditedTime: page.last_edited_time || "",
    title: propertyText(p["Step"]),
    order: propertyNumber(p["Order"]),
    startMinute: propertyNumber(p["Start Minute"]),
    duration: propertyNumber(p["Duration"]),
    stateId,
    studentDirections: propertyText(p["Student Directions"]),
    teacherNotes: propertyText(p["Teacher Notes"]),
    paperTask: propertyText(p["Paper Task"]),
    tool: propertyText(p["Tool"]),
    question: propertyText(p["Question"]),
    pollKind: propertySelect(p["Poll Kind"], POLL_KINDS),
    choices: propertyText(p["Choices"]).split(/\r?\n/).map((choice) => choice.trim()).filter(Boolean),
    correctAnswer: propertyText(p["Correct Answer"]),
    standard: propertyText(p["Standard"]),
    aiContext: parseLessonStepAiContext(stripLessonRoutineConfig(rawAiContext)).userText,
    publicSurfaceMode: resolvePublicSurfaceMode(rawAiContext, stateId),
    routineConfig: inspectRoutineConfigFromRawAiContext(rawAiContext).config,
    advance: propertySelect(p["Advance"], ADVANCE_MODES),
    required: p["Required"]?.checkbox === true,
    linkUrl: p["Link"]?.url || "",
    mainDisplay: propertyText(p["Main Display"]),
    paceDirections: propertyText(p["Pace Directions"]),
    studentAction: propertyText(p["Student Action"]),
    remoteActions: propertyText(p["Remote Actions"]),
    discussionStems: propertyText(p["Discussion Stems"]),
    vocabulary: propertyText(p["Vocabulary"]),
    responseMode: propertySelect(p["Response Mode"], RESPONSE_MODES),
    workSpaceAvailable: p["Work Space Available"]?.checkbox === true,
  };
}

async function fetchAuthorizedStep(lessonIdInput: unknown, stepIdInput: unknown): Promise<{
  lessonId: string;
  stepPage: NotionPage;
  step: EditableLessonStep;
}> {
  const lessonId = normalizeNotionPageId(lessonIdInput, "Lesson ID");
  const stepId = normalizeNotionPageId(stepIdInput, "Step ID");
  const [lessonPage, stepPage] = await Promise.all([
    fetchNotionPage(lessonId),
    fetchNotionPage(stepId),
  ]);

  const published = lessonPage.properties["Publish Workflow"]?.select?.name === "Published";
  const lessonHasStep = propertyRelationIds(lessonPage.properties["Lesson Steps"]).includes(compactNotionId(stepId));
  const stepLessonIds = propertyRelationIds(stepPage.properties["Lesson"]);
  const stepHasOnlyLesson = stepLessonIds.length === 1 && stepLessonIds[0] === compactNotionId(lessonId);

  if (
    pageIsDeleted(lessonPage)
    || pageIsDeleted(stepPage)
    || !pageBelongsTo(lessonPage, LESSON_DATA_SOURCE_ID)
    || !pageBelongsTo(stepPage, LESSON_STEP_DATA_SOURCE_ID)
    || !published
    || !lessonHasStep
    || !stepHasOnlyLesson
  ) {
    throw new LessonStepApiError("That published lesson step could not be found.", 404, "STEP_NOT_FOUND");
  }

  return { lessonId, stepPage, step: mapEditableStep(stepPage, lessonId) };
}

async function fetchAuthorizedLesson(lessonIdInput: unknown): Promise<{ lessonId: string; lessonPage: NotionPage }> {
  const lessonId = normalizeNotionPageId(lessonIdInput, "Lesson ID");
  const lessonPage = await fetchNotionPage(lessonId);
  const published = lessonPage.properties["Publish Workflow"]?.select?.name === "Published";
  if (pageIsDeleted(lessonPage) || !pageBelongsTo(lessonPage, LESSON_DATA_SOURCE_ID) || !published) {
    throw new LessonStepApiError("That published lesson could not be found.", 404, "LESSON_NOT_FOUND");
  }
  return { lessonId, lessonPage };
}

async function queryStepsByMutationToken(token: string): Promise<NotionPage[]> {
  const matches: NotionPage[] = [];
  let startCursor: string | undefined;

  do {
    const response = await fetch(`${NOTION_API}/data_sources/${LESSON_STEP_DATA_SOURCE_ID}/query`, {
      method: "POST",
      headers: notionHeaders(notionToken(), true),
      body: JSON.stringify({
        filter: {
          property: "AI Context",
          rich_text: { contains: `${CREATE_TOKEN_PREFIX}${token}` },
        },
        page_size: 100,
        ...(startCursor ? { start_cursor: startCursor } : {}),
      }),
      cache: "no-store",
    });
    if (!response.ok) throw notionFailure(response.status, response.headers.get("retry-after"));
    const payload = await response.json().catch(() => null) as NotionQueryResponse | null;
    if (!payload || !Array.isArray(payload.results)) {
      throw new LessonStepApiError(
        "Notion returned an incomplete lesson-step query response.",
        502,
        "NOTION_INVALID_RESPONSE",
      );
    }
    matches.push(...payload.results.filter((page) => (
      page?.id
      && page.properties
      && page.last_edited_time
      && extractCreateToken(propertyText(page.properties["AI Context"])) === token
    )));
    startCursor = payload.has_more && payload.next_cursor ? payload.next_cursor : undefined;
  } while (startCursor);

  return matches;
}

function reconcileMutationMatch(
  pages: NotionPage[],
  lessonId: string,
  stateId: string,
  mutationToken: string,
): NotionPage | null {
  if (!pages.length) return null;
  if (pages.length > 1) {
    throw new LessonStepApiError(
      "This add action matched more than one lesson step. Reload the lesson before trying again.",
      409,
      "DUPLICATE_MUTATION",
    );
  }

  const page = pages[0];
  const stepLessonIds = propertyRelationIds(page.properties["Lesson"]);
  const sameLesson = stepLessonIds.length === 1 && stepLessonIds[0] === compactNotionId(lessonId);
  const sameState = propertyText(page.properties["State ID"]) === stateId;
  if (
    pageIsDeleted(page)
    || !pageBelongsTo(page, LESSON_STEP_DATA_SOURCE_ID)
    || !sameLesson
    || !sameState
    || extractCreateToken(propertyText(page.properties["AI Context"])) !== mutationToken
  ) {
    throw new LessonStepApiError(
      "That mutation token was already used for a different lesson state. Start the add action again.",
      409,
      "MUTATION_TOKEN_REUSED",
    );
  }
  return page;
}

async function findStepByMutationToken(
  lessonId: string,
  stateId: string,
  mutationToken: string,
): Promise<NotionPage | null> {
  return reconcileMutationMatch(
    await queryStepsByMutationToken(mutationToken),
    lessonId,
    stateId,
    mutationToken,
  );
}

async function findStepByMutationTokenWithRetry(
  lessonId: string,
  stateId: string,
  mutationToken: string,
): Promise<NotionPage | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const match = await findStepByMutationToken(lessonId, stateId, mutationToken);
    if (match || attempt === 2) return match;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

async function fetchLessonStepSequence(lessonId: string): Promise<Array<{
  page: NotionPage;
  step: EditableLessonStep;
}>> {
  const { lessonPage } = await fetchAuthorizedLesson(lessonId);
  const relatedStepIds = propertyRelationIds(lessonPage.properties["Lesson Steps"])
    .map((stepId) => normalizeNotionPageId(stepId, "Related Step ID"));
  const relatedPages = await Promise.all(relatedStepIds.map((stepId) => fetchNotionPage(stepId)));
  return relatedPages
    .filter((page) => {
      const stepLessonIds = propertyRelationIds(page.properties["Lesson"]);
      return !pageIsDeleted(page)
        && pageBelongsTo(page, LESSON_STEP_DATA_SOURCE_ID)
        && stepLessonIds.length === 1
        && stepLessonIds[0] === compactNotionId(lessonId);
    })
    .map((page) => ({ page, step: mapEditableStep(page, lessonId) }))
    .sort((left, right) => (
      left.step.order - right.step.order
      || left.step.startMinute - right.step.startMinute
      || left.step.title.localeCompare(right.step.title)
    ));
}

async function verifyCreatedStep(lessonId: string, stepId: string): Promise<EditableLessonStep> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return (await fetchAuthorizedStep(lessonId, stepId)).step;
    } catch (error) {
      lastError = error;
      const relationMayStillBeSyncing = error instanceof LessonStepApiError
        && error.code === "STEP_NOT_FOUND"
        && attempt < 2;
      if (!relationMayStillBeSyncing) throw error;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw lastError;
}

function validateText(field: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new LessonStepApiError(`${field} must be text.`, 400, "INVALID_FIELD_VALUE");
  }
  if (value.length > NOTION_TEXT_LIMIT) {
    throw new LessonStepApiError(`${field} must be ${NOTION_TEXT_LIMIT.toLocaleString()} characters or fewer.`, 400, "FIELD_TOO_LONG");
  }
  return value;
}

function textValue(value: string): { type: "text"; text: { content: string } }[] {
  // Notion caps a single text object at 2000 characters; long values (like a
  // slide overlay's JSON) are split across objects and read back joined.
  if (!value) return [];
  const chunks: { type: "text"; text: { content: string } }[] = [];
  for (let index = 0; index < value.length; index += 1900) {
    chunks.push({ type: "text", text: { content: value.slice(index, index + 1900) } });
  }
  return chunks;
}

function validateChanges(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new LessonStepApiError("Changes must be an object.", 400, "INVALID_CHANGES");
  }

  const entries = Object.entries(input as Record<string, unknown>);
  if (!entries.length) {
    throw new LessonStepApiError("Change at least one lesson-step field before saving.", 400, "NO_CHANGES");
  }
  const unknownField = entries.find(([key]) => !EDITABLE_KEYS.has(key));
  if (unknownField) {
    throw new LessonStepApiError(`${unknownField[0]} is not an editable lesson-step field.`, 400, "UNSUPPORTED_FIELD");
  }

  const properties: Record<string, unknown> = {};
  for (const [key, rawValue] of entries) {
    if (key === "publicSurfaceMode") {
      if (!isPublicSurfaceMode(rawValue)) {
        throw new LessonStepApiError("Public screens must use split or linked mode.", 400, "INVALID_FIELD_VALUE");
      }
      continue;
    }

    if (key === "routineConfig") {
      if (rawValue !== null) {
        try {
          validateLessonRoutineConfig(rawValue);
        } catch (error) {
          throw new LessonStepApiError(
            error instanceof Error ? error.message : "Lesson routine configuration is invalid.",
            400,
            "INVALID_FIELD_VALUE",
          );
        }
      }
      continue;
    }

    if (key in TEXT_PROPERTIES) {
      const config = TEXT_PROPERTIES[key as keyof typeof TEXT_PROPERTIES];
      const value = validateText(config.notionName, rawValue);
      properties[config.notionName] = config.type === "title"
        ? { title: textValue(value) }
        : { rich_text: textValue(value) };
      continue;
    }

    if (key in NUMBER_PROPERTIES) {
      const config = NUMBER_PROPERTIES[key as keyof typeof NUMBER_PROPERTIES];
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        throw new LessonStepApiError(`${config.notionName} must be a finite number.`, 400, "INVALID_FIELD_VALUE");
      }
      if (config.integer && !Number.isInteger(rawValue)) {
        throw new LessonStepApiError(`${config.notionName} must be a whole number.`, 400, "INVALID_FIELD_VALUE");
      }
      if (rawValue < config.min || rawValue > config.max) {
        throw new LessonStepApiError(
          `${config.notionName} must be between ${config.min === Number.EPSILON ? 0 : config.min} and ${config.max}.`,
          400,
          "INVALID_FIELD_VALUE",
        );
      }
      properties[config.notionName] = { number: rawValue };
      continue;
    }

    if (key in SELECT_PROPERTIES) {
      const config = SELECT_PROPERTIES[key as keyof typeof SELECT_PROPERTIES];
      if (typeof rawValue !== "string" || !(config.values as readonly string[]).includes(rawValue)) {
        throw new LessonStepApiError(`${config.notionName} has an unsupported option.`, 400, "INVALID_FIELD_VALUE");
      }
      properties[config.notionName] = { select: rawValue ? { name: rawValue } : null };
      continue;
    }

    if (key in BOOLEAN_PROPERTIES) {
      const notionName = BOOLEAN_PROPERTIES[key as keyof typeof BOOLEAN_PROPERTIES];
      if (typeof rawValue !== "boolean") {
        throw new LessonStepApiError(`${notionName} must be true or false.`, 400, "INVALID_FIELD_VALUE");
      }
      properties[notionName] = { checkbox: rawValue };
      continue;
    }

    if (key === "choices") {
      if (!Array.isArray(rawValue) || rawValue.some((choice) => typeof choice !== "string")) {
        throw new LessonStepApiError("Choices must be a list of text values.", 400, "INVALID_FIELD_VALUE");
      }
      const choices = (rawValue as string[]).join("\n");
      if (choices.length > NOTION_TEXT_LIMIT) {
        throw new LessonStepApiError(`Choices must total ${NOTION_TEXT_LIMIT.toLocaleString()} characters or fewer.`, 400, "FIELD_TOO_LONG");
      }
      properties["Choices"] = { rich_text: textValue(choices) };
      continue;
    }

    if (key === "linkUrl") {
      if (typeof rawValue !== "string") {
        throw new LessonStepApiError("Link must be text.", 400, "INVALID_FIELD_VALUE");
      }
      const linkUrl = rawValue.trim();
      if (linkUrl.length > NOTION_URL_LIMIT) {
        throw new LessonStepApiError(`Link must be ${NOTION_URL_LIMIT.toLocaleString()} characters or fewer.`, 400, "FIELD_TOO_LONG");
      }
      if (linkUrl) {
        let parsed: URL;
        try {
          parsed = new URL(linkUrl);
        } catch {
          throw new LessonStepApiError("Link must be a valid web address.", 400, "INVALID_FIELD_VALUE");
        }
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          throw new LessonStepApiError("Link must use http or https.", 400, "INVALID_FIELD_VALUE");
        }
      }
      properties["Link"] = { url: linkUrl || null };
    }
  }

  return properties;
}

async function patchNotionStep(stepId: string, properties: Record<string, unknown>): Promise<NotionPage> {
  const response = await fetch(`${NOTION_API}/pages/${stepId}`, {
    method: "PATCH",
    headers: notionHeaders(notionToken(), true),
    body: JSON.stringify({ properties }),
    cache: "no-store",
  });
  if (!response.ok) throw notionFailure(response.status, response.headers.get("retry-after"));
  const page = await response.json().catch(() => null) as NotionPage | null;
  if (!page?.id || !page.properties || !page.last_edited_time) {
    throw new LessonStepApiError("Notion returned an incomplete lesson-step response.", 502, "NOTION_INVALID_RESPONSE");
  }
  return page;
}

async function reflowLessonStartMinutes(
  lessonId: string,
  pivotStepId: string,
  alignPivotToPreviousStep: boolean,
): Promise<void> {
  const sequence = await fetchLessonStepSequence(lessonId);
  const pivotIndex = sequence.findIndex(({ step }) => compactNotionId(step.id) === compactNotionId(pivotStepId));
  if (pivotIndex < 0) {
    throw new LessonStepApiError(
      "The lesson sequence changed while its timing was being updated. Reload the lesson before trying again.",
      409,
      "SEQUENCE_CHANGED",
    );
  }

  let priorStart = pivotIndex > 0 ? sequence[pivotIndex - 1].step.startMinute : 0;
  let priorDuration = pivotIndex > 0 ? sequence[pivotIndex - 1].step.duration : 0;
  for (let index = pivotIndex; index < sequence.length; index += 1) {
    const entry = sequence[index];
    const targetStart = index === pivotIndex && !alignPivotToPreviousStep
      ? entry.step.startMinute
      : priorStart + priorDuration;
    if (Math.abs(entry.step.startMinute - targetStart) > Number.EPSILON) {
      const updatedPage = await patchNotionStep(entry.step.id, { "Start Minute": { number: targetStart } });
      entry.page = updatedPage;
      entry.step = mapEditableStep(updatedPage, lessonId);
    }
    priorStart = targetStart;
    priorDuration = entry.step.duration;
  }
}

async function createNotionStep(properties: Record<string, unknown>): Promise<NotionPage> {
  const response = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: notionHeaders(notionToken(), true),
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: LESSON_STEP_DATA_SOURCE_ID },
      properties,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw notionFailure(response.status, response.headers.get("retry-after"));
  const page = await response.json().catch(() => null) as NotionPage | null;
  if (!page?.id || !page.properties || !page.last_edited_time) {
    throw new LessonStepApiError("Notion returned an incomplete new lesson-step response.", 502, "NOTION_INVALID_RESPONSE");
  }
  return page;
}

export async function getPublishedLessonStep(lessonId: unknown, stepId: unknown): Promise<EditableLessonStep> {
  return (await fetchAuthorizedStep(lessonId, stepId)).step;
}

export async function createPublishedLessonStep(input: {
  lessonId: unknown;
  insertAfterStepId?: unknown;
  stateId: unknown;
  mutationToken: unknown;
}): Promise<EditableLessonStep> {
  const requestedStateId = typeof input.stateId === "string" ? input.stateId.trim() : "";
  const state = CLASS_STATE_BY_ID.get(requestedStateId);
  if (!state) {
    throw new LessonStepApiError("Choose a lesson state from the classroom state bank.", 400, "INVALID_STATE_ID");
  }
  const mutationToken = validateMutationToken(input.mutationToken);

  const serializedLessonId = normalizeNotionPageId(input.lessonId, "Lesson ID");
  return withSerializedLessonWrite(serializedLessonId, async () => {
    const { lessonId } = await fetchAuthorizedLesson(serializedLessonId);
    const existingPage = await findStepByMutationToken(lessonId, requestedStateId, mutationToken);
    if (existingPage) {
      const existingId = normalizeNotionPageId(existingPage.id, "Step ID");
      await verifyCreatedStep(lessonId, existingId);
      await reflowLessonStartMinutes(lessonId, existingId, true);
      return (await fetchAuthorizedStep(lessonId, existingId)).step;
    }

    const steps = (await fetchLessonStepSequence(lessonId)).map(({ step }) => step);

    let anchorIndex = steps.length - 1;
    if (input.insertAfterStepId !== undefined && input.insertAfterStepId !== null && input.insertAfterStepId !== "") {
      const anchorId = normalizeNotionPageId(input.insertAfterStepId, "Insert-after Step ID");
      anchorIndex = steps.findIndex((step) => compactNotionId(step.id) === compactNotionId(anchorId));
      if (anchorIndex < 0) {
        throw new LessonStepApiError("The selected lesson step changed. Reload the lesson before adding a state.", 409, "INSERT_ANCHOR_CHANGED");
      }
    }

    const anchor = anchorIndex >= 0 ? steps[anchorIndex] : null;
    const next = anchorIndex >= 0 ? steps[anchorIndex + 1] : null;
    const order = anchor
      ? next && next.order > anchor.order
        ? anchor.order + ((next.order - anchor.order) / 2)
        : anchor.order + 0.001
      : 1;
    const startMinute = anchor ? anchor.startMinute + anchor.duration : 0;
    const defaults = classStateStepDefaults(state);
    const properties = validateChanges({
      ...defaults,
      startMinute,
    });
    properties["Order"] = { number: order };
    properties["Lesson"] = { relation: [{ id: lessonId }] };
    const routineConfig = defaultLessonRoutineConfig(state.id);
    const contextWithRoutine = routineConfig ? withLessonRoutineConfig("", routineConfig) : "";
    const initialAiContext = setPublicSurfaceMode(
      contextWithRoutine,
      defaultPublicSurfaceModeForState(state.id),
    );
    properties["AI Context"] = richTextWithCreateToken(initialAiContext, mutationToken);

    let createdId: string;
    try {
      const createdPage = await createNotionStep(properties);
      createdId = normalizeNotionPageId(createdPage.id, "Step ID");
    } catch (error) {
      const reconciled = await findStepByMutationTokenWithRetry(lessonId, requestedStateId, mutationToken).catch(() => null);
      if (!reconciled) throw error;
      createdId = normalizeNotionPageId(reconciled.id, "Step ID");
    }

    await verifyCreatedStep(lessonId, createdId);
    await reflowLessonStartMinutes(lessonId, createdId, true);
    return (await fetchAuthorizedStep(lessonId, createdId)).step;
  });
}

export async function updatePublishedLessonStep(input: {
  lessonId: unknown;
  stepId: unknown;
  expectedLastEditedTime: unknown;
  changes: unknown;
}): Promise<EditableLessonStep> {
  if (typeof input.expectedLastEditedTime !== "string" || !input.expectedLastEditedTime.trim()) {
    throw new LessonStepApiError("Reload this lesson step before saving it.", 428, "REVISION_REQUIRED");
  }
  if (input.expectedLastEditedTime.length > 100 || !Number.isFinite(Date.parse(input.expectedLastEditedTime))) {
    throw new LessonStepApiError("The lesson-step revision is invalid. Reload before saving.", 400, "INVALID_REVISION");
  }

  const properties = validateChanges(input.changes);
  const serializedStepId = normalizeNotionPageId(input.stepId, "Step ID");
  const serializedLessonId = normalizeNotionPageId(input.lessonId, "Lesson ID");
  const changes = input.changes as Record<string, unknown>;
  const timingChanged = Object.prototype.hasOwnProperty.call(changes, "duration")
    || Object.prototype.hasOwnProperty.call(changes, "startMinute");

  const write = () => withSerializedStepWrite(serializedStepId, async () => {
    const current = await fetchAuthorizedStep(input.lessonId, serializedStepId);
    if (current.step.lastEditedTime !== input.expectedLastEditedTime) {
      throw new LessonStepApiError(
        "This lesson step changed in Notion. Reload it before saving.",
        409,
        "EDIT_CONFLICT",
        undefined,
        current.step,
      );
    }
    const currentRawAiContext = propertyText(current.stepPage.properties["AI Context"]);
    const currentRoutineInspection = inspectRoutineConfigFromRawAiContext(currentRawAiContext);
    const routineConfigWillBeReplaced = Object.prototype.hasOwnProperty.call(changes, "routineConfig");
    if (currentRoutineInspection.invalid && !routineConfigWillBeReplaced) {
      throw invalidRoutineConfigError();
    }
    if (
      Object.prototype.hasOwnProperty.call(changes, "aiContext")
      || Object.prototype.hasOwnProperty.call(changes, "publicSurfaceMode")
      || Object.prototype.hasOwnProperty.call(changes, "routineConfig")
    ) {
      let nextRawAiContext = currentRawAiContext;
      try {
        if (Object.prototype.hasOwnProperty.call(changes, "aiContext")) {
          const routineConfig = routineConfigWillBeReplaced
            ? changes.routineConfig === null
              ? null
              : validateLessonRoutineConfig(changes.routineConfig)
            : currentRoutineInspection.config;
          nextRawAiContext = replaceLessonStepAiContextText(
            stripLessonRoutineConfig(currentRawAiContext),
            changes.aiContext as string,
          );
          nextRawAiContext = withLessonRoutineConfig(nextRawAiContext, routineConfig);
        }
        if (Object.prototype.hasOwnProperty.call(changes, "publicSurfaceMode")) {
          nextRawAiContext = setPublicSurfaceMode(
            nextRawAiContext,
            changes.publicSurfaceMode as PublicSurfaceMode,
          );
        }
        if (Object.prototype.hasOwnProperty.call(changes, "routineConfig")) {
          nextRawAiContext = withLessonRoutineConfig(
            nextRawAiContext,
            changes.routineConfig === null
              ? null
              : validateLessonRoutineConfig(changes.routineConfig),
          );
        }
      } catch (error) {
        if (error instanceof LessonStepApiError) throw error;
        throw new LessonStepApiError(
          error instanceof Error ? error.message : "Lesson-step metadata is invalid.",
          400,
          "INVALID_FIELD_VALUE",
        );
      }
      if (nextRawAiContext.length > NOTION_TEXT_LIMIT) {
        throw new LessonStepApiError(
          `AI Context and internal lesson settings must total ${NOTION_TEXT_LIMIT.toLocaleString()} characters or fewer.`,
          400,
          "FIELD_TOO_LONG",
        );
      }
      properties["AI Context"] = { rich_text: textValue(nextRawAiContext) };
    }

    try {
      const updatedPage = await patchNotionStep(current.step.id, properties);
      if (pageIsDeleted(updatedPage) || !pageBelongsTo(updatedPage, LESSON_STEP_DATA_SOURCE_ID)) {
        throw new LessonStepApiError("That published lesson step could not be found.", 404, "STEP_NOT_FOUND");
      }

      const verified = await fetchAuthorizedStep(current.lessonId, current.step.id);
      if (verified.step.lastEditedTime !== updatedPage.last_edited_time) {
        throw new LessonStepApiError(
          "This lesson step changed while it was saving. Your draft was preserved.",
          409,
          "EDIT_CONFLICT",
          undefined,
          verified.step,
        );
      }
      if (timingChanged) {
        await reflowLessonStartMinutes(current.lessonId, current.step.id, false);
        return (await fetchAuthorizedStep(current.lessonId, current.step.id)).step;
      }
      return verified.step;
    } catch (error) {
      if (!(error instanceof LessonStepApiError) || error.status !== 409) throw error;
      const refreshed = await fetchAuthorizedStep(current.lessonId, current.step.id).catch(() => current);
      throw new LessonStepApiError(
        "This lesson step changed in Notion. Reload it before saving.",
        409,
        "EDIT_CONFLICT",
        undefined,
        refreshed.step,
      );
    }
  });

  return timingChanged
    ? withSerializedLessonWrite(serializedLessonId, write)
    : write();
}
