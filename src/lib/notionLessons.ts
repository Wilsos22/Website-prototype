// Notion API integration for the Math 6 Lessons database (no SDK dependency — uses raw fetch).
// Requires NOTION_TOKEN env var (Notion internal integration token).
// Parent database ID: 613d13a5-ac90-4ab3-9f5f-b7da95911ec3
// Child data source IDs returned by Notion for this database.

import {
  lessonRoutineConfigFromAiContext,
  publicLessonRoutineConfig,
  stripLessonRoutineConfig,
  type PublicLessonRoutineConfig,
} from "./lessonRoutineConfig";
import {
  parseLessonStepAiContext,
  resolvePublicSurfaceMode,
  type PublicSurfaceMode,
} from "./lessonStepMetadata";

const DATA_SOURCE_IDS = [
  "e367e541-c0c7-4613-8066-d2e61b6fee64",
  "3282eba1-de37-8069-a043-000b7c36799d",
  "d1c8e7b0-9a3c-4f1b-8c5c-9a2e5f0a1a3f",
];
const LESSON_DATABASE_ID = "613d13a5-ac90-4ab3-9f5f-b7da95911ec3";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

export interface LessonStepData {
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
  pollKind: "short-answer" | "multiple-choice" | "multiple-choice-explain" | "fist-to-five" | "";
  choices: string[];
  correctAnswer: string;
  standard: string;
  aiContext: string;
  publicSurfaceMode: PublicSurfaceMode;
  routineConfig: PublicLessonRoutineConfig | null;
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


export interface LessonData {
  id: string;
  lessonCode: string;
  title: string;
  subtitle: string;
  essentialIdeas: string;
  assignmentLink: string;
  date: string;       // ISO date string (start of the Date property)
  dateEnd: string;    // ISO date string (end of a Date range; "" for single dates)
  dueDate: string;    // ISO date string
  topic: string;
  module: string;
  moduleTopic: string; // the unit/module topic name (better than the raw Topic for warm-ups)
  standard: string;    // first CCSS code found on the page (e.g. "6.G.A.1"); "" if none
  // Optional agenda fields — add these columns in Notion to fill them; empty if absent.
  agenda: string;        // text, one activity per line
  supplies: string;      // text list, or checked Supply: ... checkbox properties
  tools: string;         // text list, or checked Tool: ... checkbox properties
  suppliesConfigured: boolean;
  toolsConfigured: boolean;
  warmUpLink: string;    // url to today's warm-up
  exitTicketLink: string; // url to the exit ticket
  // Lesson-flow fields for the auto-built sequence. Empty if the Notion column is absent.
  learningIntention: string;
  successCriteria: string;
  selectedSuccessCriterion: string;
  classroomMode: string;
  discussionStems: string;
  discussionVocabulary: string;
  requiredPaperWork: string;
  requiredDigitalWork: string;
  optionalSupport: string;
  bigDogChallenge: string;
  dueAndTurnIn: string;
  helpPath: string;
  discussionPrompt: string;
  practiceProblems: string;
  // Pre-planned reteach groups: one line per group, "misconception tag :: prepared move".
  // The Right-now view matches live clusters to these and shows YOUR plan first.
  misconceptionPlans: string;
  liveQuestions: string;
  midLessonCheckPrompt: string;
  exitTicketPrompt: string;
  exitTicketAnswer: string;
  steps: LessonStepData[];
}

interface RichTextItem {
  plain_text: string;
}

interface NotionProperty {
  type: string;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  url?: string | null;
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  date?: { start: string; end?: string | null } | null;
  checkbox?: boolean;
  number?: number | null;
  relation?: { id: string }[];
  formula?: {
    type: string;
    string?: string | null;
    number?: number | null;
    boolean?: boolean | null;
    date?: { start: string } | null;
  };
  rollup?: {
    type: string;
    array?: NotionProperty[];
    number?: number | null;
    date?: { start: string } | null;
  };
}

interface NotionPage {
  id: string;
  archived?: boolean;
  in_trash?: boolean;
  parent?: {
    type?: string;
    data_source_id?: string;
    database_id?: string;
  };
  properties: Record<string, NotionProperty>;
}

interface NotionQueryResponse {
  results: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
}

export function isExplicitlySkippedLesson(skipValue: string | null | undefined): boolean {
  return String(skipValue || "").trim().toLowerCase() === "yes";
}

export class LessonLookupConflictError extends Error {
  readonly lessonCode: string;

  constructor(lessonCode: string) {
    super(`Multiple published Notion lessons use lesson code ${lessonCode}. Open the exact lesson from Teacher Home or unpublish the duplicate.`);
    this.name = "LessonLookupConflictError";
    this.lessonCode = lessonCode;
  }
}

function extractText(prop: NotionProperty | undefined): string {
  if (!prop) return "";
  if (prop.type === "title") return prop.title?.map((t) => t.plain_text).join("") ?? "";
  if (prop.type === "rich_text") return prop.rich_text?.map((t) => t.plain_text).join("") ?? "";
  if (prop.type === "url") return prop.url ?? "";
  if (prop.type === "select") return prop.select?.name ?? "";
  if (prop.type === "multi_select") return prop.multi_select?.map((s) => s.name).join(", ") ?? "";
  if (prop.type === "date") return prop.date?.start ?? "";
  if (prop.type === "formula") {
    if (prop.formula?.type === "string") return prop.formula.string ?? "";
    if (prop.formula?.type === "number") return prop.formula.number?.toString() ?? "";
    if (prop.formula?.type === "date") return prop.formula.date?.start ?? "";
  }
  if (prop.type === "rollup") {
    if (prop.rollup?.type === "array") return prop.rollup.array?.map(extractText).filter(Boolean).join("\n") ?? "";
    if (prop.rollup?.type === "number") return prop.rollup.number?.toString() ?? "";
    if (prop.rollup?.type === "date") return prop.rollup.date?.start ?? "";
  }
  return "";
}

function extractPublicRoutineConfig(rawAiContext: string): PublicLessonRoutineConfig | null {
  try {
    const config = lessonRoutineConfigFromAiContext(rawAiContext);
    return config ? publicLessonRoutineConfig(config) : null;
  } catch {
    return null;
  }
}

function extractNumber(prop: NotionProperty | undefined): number {
  if (!prop) return 0;
  if (prop.type === "number") return Number(prop.number ?? 0);
  const value = Number(extractText(prop));
  return Number.isFinite(value) ? value : 0;
}

function firstUrlFromText(text: string): string {
  return text.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.;]+$/, "") ?? "";
}

function extractUrl(prop: NotionProperty | undefined): string {
  if (!prop) return "";
  if (prop.type === "url") return prop.url ?? "";
  if (prop.type === "title" || prop.type === "rich_text" || prop.type === "formula") {
    return firstUrlFromText(extractText(prop));
  }
  if (prop.type === "rollup" && prop.rollup?.type === "array") {
    for (const item of prop.rollup.array ?? []) {
      const url = extractUrl(item);
      if (url) return url;
    }
  }
  return "";
}

async function fetchRelatedPage(pageId: string, token: string, cache: Map<string, Promise<NotionPage>>): Promise<NotionPage> {
  let cached = cache.get(pageId);
  if (!cached) {
    cached = fetch(`${NOTION_API}/pages/${pageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
      },
      cache: "no-store",
    }).then(async (res) => {
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Related Notion page ${pageId} error ${res.status}: ${detail}`);
      }
      return res.json() as Promise<NotionPage>;
    });
    cache.set(pageId, cached);
  }
  return cached;
}

function compactNotionId(value: string | undefined): string {
  return (value || "").trim().replace(/-/g, "").toLowerCase();
}

function normalizeNotionPageId(value: string): string | null {
  const compact = compactNotionId(value);
  if (!/^[0-9a-f]{32}$/.test(compact)) return null;
  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join("-");
}

const LESSON_PARENT_IDS = new Set([...DATA_SOURCE_IDS, LESSON_DATABASE_ID].map(compactNotionId));

function belongsToLessonDatabase(page: NotionPage): boolean {
  return [page.parent?.data_source_id, page.parent?.database_id]
    .map(compactNotionId)
    .some((parentId) => LESSON_PARENT_IDS.has(parentId));
}

async function resolveLink(
  prop: NotionProperty | undefined,
  token: string,
  cache: Map<string, Promise<NotionPage>>,
  relatedPropertyNames: string[] = [],
): Promise<string> {
  const directUrl = extractUrl(prop);
  if (directUrl) return directUrl;

  if (prop?.type !== "relation") return "";

  for (const relation of prop.relation ?? []) {
    let relatedPage: NotionPage;
    try {
      relatedPage = await fetchRelatedPage(relation.id, token, cache);
    } catch (err) {
      console.warn(err instanceof Error ? err.message : err);
      continue;
    }

    // Notion relations can keep pointing at pages after those pages have been
    // moved to Trash. Never surface a form or resource from a deleted record.
    if (relatedPage.archived || relatedPage.in_trash) continue;

    for (const name of relatedPropertyNames) {
      const url = extractUrl(relatedPage.properties[name]);
      if (url) return url;
    }

    for (const relatedProp of Object.values(relatedPage.properties)) {
      const url = extractUrl(relatedProp);
      if (url) return url;
    }
  }

  return "";
}

async function resolveFirstLink(
  properties: Record<string, NotionProperty>,
  names: string[],
  token: string,
  cache: Map<string, Promise<NotionPage>>,
  relatedPropertyNames: string[] = [],
): Promise<string> {
  for (const name of names) {
    const link = await resolveLink(properties[name], token, cache, relatedPropertyNames);
    if (link) return link;
  }
  return "";
}

function extractFirstText(properties: Record<string, NotionProperty>, names: string[]): string {
  for (const name of names) {
    const text = extractText(properties[name]);
    if (text.trim()) return text;
  }
  return "";
}

function splitList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniq(items: string[]): string[] {
  return [...new Set(items)];
}

function checkedPrefixedProperties(properties: Record<string, NotionProperty>, prefixes: string[]): string[] {
  const items: string[] = [];
  for (const [name, prop] of Object.entries(properties)) {
    if (prop.type !== "checkbox" || !prop.checkbox) continue;
    const match = prefixes.find((prefix) => name.toLowerCase().startsWith(prefix.toLowerCase()));
    if (!match) continue;
    const label = name.slice(match.length).trim().replace(/^[-:]\s*/, "");
    if (label) items.push(label);
  }
  return items;
}

function hasPrefixedCheckboxProperties(properties: Record<string, NotionProperty>, prefixes: string[]): boolean {
  return Object.entries(properties).some(([name, prop]) => (
    prop.type === "checkbox" && prefixes.some((prefix) => name.toLowerCase().startsWith(prefix.toLowerCase()))
  ));
}

function checkedNamedProperties(properties: Record<string, NotionProperty>, names: string[]): string[] {
  return names.filter((name) => properties[name]?.type === "checkbox" && properties[name]?.checkbox);
}

function hasNamedCheckboxProperties(properties: Record<string, NotionProperty>, names: string[]): boolean {
  return names.some((name) => properties[name]?.type === "checkbox");
}

const SUPPLY_PREFIXES = ["Supply:", "Supply -", "Supplies:", "Supplies -"];
const TOOL_PREFIXES = ["Tool:", "Tool -", "Tools:", "Tools -"];

const SUPPLY_CHECKBOX_NAMES = [
  "Pencil",
  "Notebook",
  "Notebook or paper",
  "Paper",
  "Chromebook",
  "Chromebook (charged)",
  "Calculator",
  "Ruler",
  "Protractor",
  "Colored Pencils",
  "Scissors",
  "Glue",
  "Dry Erase Marker",
];

const TOOL_CHECKBOX_NAMES = [
  "Whiteboard",
  "Number Line",
  "Fraction Bars",
  "Group Bars",
  "Percent Bar",
  "Algebra Tiles",
  "Equation Builder",
  "GEMS",
  "Order of Operations",
  "Combine Like Terms",
  "Proportions",
  "Proportion Builder",
  "Timer",
];

// End of a Date range (weekly-scheduled lessons); "" for single dates.
function extractDateEnd(prop: NotionProperty | undefined): string {
  if (prop?.type === "date") return prop.date?.end ?? "";
  return "";
}

// Scan every property for the first CCSS code (e.g. "6.G.A.1", "6.EE.A.2c"), so
// we get a reliable standard regardless of which property it lives in.
const CCSS_RE = /\b[3-8]\.(?:NS|RP|EE|G|SP|NBT|NF|OA|MD)\.[A-Za-z0-9.]+/;
function extractAnyCcss(properties: Record<string, NotionProperty>): string {
  for (const key of Object.keys(properties)) {
    let text = "";
    try { text = extractText(properties[key]); } catch { text = ""; }
    const m = text.match(CCSS_RE);
    if (m) return m[0];
  }
  return "";
}

async function mapPage(
  page: NotionPage,
  token: string,
  cache: Map<string, Promise<NotionPage>>,
  options: { includeRelations?: boolean } = {},
): Promise<LessonData> {
  const p = page.properties;
  const supplyText = extractText(p["Supplies"]);
  const toolText = extractText(p["Tools"]);
  const checkedSupplies = uniq([
    ...checkedPrefixedProperties(p, SUPPLY_PREFIXES),
    ...checkedNamedProperties(p, SUPPLY_CHECKBOX_NAMES),
  ]);
  const checkedTools = uniq([
    ...checkedPrefixedProperties(p, TOOL_PREFIXES),
    ...checkedNamedProperties(p, TOOL_CHECKBOX_NAMES),
  ]);
  const hasSupplyCheckboxes = hasPrefixedCheckboxProperties(p, SUPPLY_PREFIXES) || hasNamedCheckboxProperties(p, SUPPLY_CHECKBOX_NAMES);
  const hasToolCheckboxes = hasPrefixedCheckboxProperties(p, TOOL_PREFIXES) || hasNamedCheckboxProperties(p, TOOL_CHECKBOX_NAMES);

  const steps = options.includeRelations === false ? [] : await Promise.all((p["Lesson Steps"]?.relation ?? []).map(async ({ id }) => {
    const related = await fetchRelatedPage(id, token, cache);
    const step = related.properties;
    const rawKind = extractText(step["Poll Kind"]);
    const pollKind = rawKind === "short-answer" || rawKind === "multiple-choice"
      || rawKind === "multiple-choice-explain" || rawKind === "fist-to-five"
      ? rawKind
      : "";
    const stateId = extractText(step["State ID"]);
    const rawAiContext = extractText(step["AI Context"]);
    return {
      id: related.id,
      title: extractFirstText(step, ["Step title", "Name", "Step"]),
      order: extractNumber(step["Order"]),
      startMinute: extractNumber(step["Start Minute"]),
      duration: extractNumber(step["Duration"]),
      stateId,
      studentDirections: extractText(step["Student Directions"]),
      teacherNotes: extractText(step["Teacher Notes"]),
      paperTask: extractText(step["Paper Task"]),
      tool: extractText(step["Tool"]),
      question: extractText(step["Question"]),
      pollKind,
      choices: splitList(extractText(step["Choices"])),
      correctAnswer: extractText(step["Correct Answer"]),
      standard: extractText(step["Standard"]),
      aiContext: parseLessonStepAiContext(stripLessonRoutineConfig(rawAiContext)).userText,
      publicSurfaceMode: resolvePublicSurfaceMode(rawAiContext, stateId),
      routineConfig: extractPublicRoutineConfig(rawAiContext),
      advance: extractText(step["Advance"]),
      required: step["Required"]?.checkbox ?? false,
      linkUrl: extractFirstText(step, ["Link", "Link URL"])
        ? extractUrl(step["Link"]) || extractUrl(step["Link URL"])
        : "",
      mainDisplay: extractText(step["Main Display"]),
      paceDirections: extractText(step["Pace Directions"]),
      studentAction: extractText(step["Student Action"]),
      remoteActions: extractText(step["Remote Actions"]),
      discussionStems: extractText(step["Discussion Stems"]),
      vocabulary: extractText(step["Vocabulary"]),
      responseMode: extractText(step["Response Mode"]),
      workSpaceAvailable: step["Work Space Available"]?.type === "checkbox"
        ? step["Work Space Available"].checkbox
        : undefined,
    } satisfies LessonStepData;
  }));
  steps.sort((a, b) => a.order - b.order || a.startMinute - b.startMinute || a.title.localeCompare(b.title));

  return {
    id: page.id,
    lessonCode: extractText(p["Lesson Code"]),
    title: extractText(p["Lesson"]),
    subtitle: extractText(p["Subtitle"]),
    essentialIdeas: extractText(p["Essential Ideas"]),
    assignmentLink: options.includeRelations === false
      ? ""
      : await resolveFirstLink(p, ["Assignment Link", "Assignment", "Assignment URL"], token, cache),
    date: extractText(p["Date"]),
    dateEnd: extractDateEnd(p["Date"]),
    dueDate: extractText(p["Due Date"]),
    topic: extractFirstText(p, ["Topic", "Topic #", "Topic Code"]),
    module: extractText(p["Module #"]),
    moduleTopic: extractFirstText(p, ["Module Topic", "Module topic", "Unit Topic", "Topic Name", "Lesson Topic"]),
    standard: extractAnyCcss(p),
    agenda: extractText(p["Agenda"]),
    supplies: uniq([...splitList(supplyText), ...checkedSupplies]).join("\n"),
    tools: uniq([...splitList(toolText), ...checkedTools]).join("\n"),
    suppliesConfigured: Boolean(supplyText.trim()) || hasSupplyCheckboxes,
    toolsConfigured: Boolean(toolText.trim()) || hasToolCheckboxes,
    warmUpLink: options.includeRelations === false
      ? ""
      : await resolveFirstLink(
        p,
        ["Warm Up Link", "Warm-Up Link", "Warm up links 1", "Warm-Up", "Warm Up"],
        token,
        cache,
        ["Form Link"],
      ),
    exitTicketLink: options.includeRelations === false
      ? ""
      : await resolveFirstLink(p, ["Exit Ticket Link", "Exit-Ticket Link", "Exit Ticket", "Exit Ticket URL"], token, cache),
    learningIntention: extractText(p["Learning Intention"]),
    successCriteria: extractText(p["Success Criteria"]),
    selectedSuccessCriterion: extractText(p["Selected Success Criterion"]),
    classroomMode: extractText(p["Classroom Mode"]),
    discussionStems: extractText(p["Discussion Stems"]),
    discussionVocabulary: extractText(p["Discussion Vocabulary"]),
    requiredPaperWork: extractText(p["Required Paper Work"]),
    requiredDigitalWork: extractText(p["Required Digital Work"]),
    optionalSupport: extractText(p["Optional Support"]),
    bigDogChallenge: extractText(p["Big Dog Challenge"]),
    dueAndTurnIn: extractText(p["Due and Turn In"]),
    helpPath: extractText(p["Help Path"]),
    discussionPrompt: extractText(p["Discussion Prompt"]),
    practiceProblems: extractText(p["Practice Problems"]),
    misconceptionPlans: extractText(p["Misconception Plans"]),
    liveQuestions: extractText(p["Live Questions"]),
    midLessonCheckPrompt: extractText(p["Mid-Lesson Check Prompt"]),
    exitTicketPrompt: extractText(p["Exit Ticket Prompt"]),
    exitTicketAnswer: extractText(p["Exit Ticket Answer"]),
    steps,
  };
}

async function queryLessons(
  body: Record<string, unknown>,
  options: { requireComplete?: boolean; includeRelations?: boolean } = {},
): Promise<LessonData[]> {
  const token = process.env.NOTION_TOKEN;

  if (!token) {
    throw new Error("NOTION_TOKEN is not set. Add it to your Vercel environment variables.");
  }

  const lessons: LessonData[] = [];
  const errors: string[] = [];
  const relatedPageCache = new Map<string, Promise<NotionPage>>();
  let failedDataSources = 0;

  for (const dataSourceId of DATA_SOURCE_IDS) {
    let startCursor: string | null = null;
    let dataSourceFailed = false;

    do {
      const requestBody: Record<string, unknown> = {
        ...body,
        page_size: 100,
        ...(startCursor ? { start_cursor: startCursor } : {}),
      };
      const res = await fetch(`${NOTION_API}/data_sources/${dataSourceId}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_VERSION,
        },
        body: JSON.stringify(requestBody),
        cache: "no-store",
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        errors.push(`${dataSourceId}: Notion API error ${res.status}: ${detail}`);
        dataSourceFailed = true;
        break;
      }

      const data = (await res.json()) as NotionQueryResponse;
      lessons.push(...await Promise.all(
        data.results
          .filter((page) => (
            !page.archived
            && !page.in_trash
            && !isExplicitlySkippedLesson(extractText(page.properties.Skip))
          ))
          .map((page) => mapPage(page, token, relatedPageCache, { includeRelations: options.includeRelations })),
      ));

      if (!data.has_more) {
        startCursor = null;
        break;
      }
      if (!data.next_cursor || data.next_cursor === startCursor) {
        errors.push(`${dataSourceId}: Notion pagination did not return a usable next cursor.`);
        dataSourceFailed = true;
        break;
      }
      startCursor = data.next_cursor;
    } while (startCursor);

    if (dataSourceFailed) failedDataSources += 1;
  }

  if ((options.requireComplete && failedDataSources > 0) || (!lessons.length && failedDataSources === DATA_SOURCE_IDS.length)) {
    throw new Error(errors.join(" | "));
  }

  return lessons;
}

export async function getTodayLesson(isoDate: string): Promise<LessonData | null> {
  const lessons = await queryLessons({
    filter: {
      and: [
        { property: "Publish Workflow", select: { equals: "Published" } },
        { property: "Date", date: { equals: isoDate } },
      ],
    },
  });
  return lessons[0] ?? null;
}

export async function getPublishedLessonsForDateRange(startDate: string, endDate: string): Promise<LessonData[]> {
  return queryLessons(
    {
      filter: {
        and: [
          { property: "Publish Workflow", select: { equals: "Published" } },
          { property: "Date", date: { on_or_after: startDate } },
          { property: "Date", date: { on_or_before: endDate } },
        ],
      },
      sorts: [{ property: "Date", direction: "ascending" }],
    },
    { includeRelations: false },
  );
}

export async function getAllPublishedLessons(): Promise<LessonData[]> {
  return queryLessons({
    filter: {
      property: "Publish Workflow",
      select: { equals: "Published" },
    },
    sorts: [{ property: "Date", direction: "descending" }],
  });
}

export async function getLessonByCode(code: string): Promise<LessonData | null> {
  const normalizedCode = code.trim();
  if (!normalizedCode) return null;
  const lessons = await queryLessons(
    {
      filter: {
        and: [
          { property: "Publish Workflow", select: { equals: "Published" } },
          { property: "Lesson Code", rich_text: { equals: normalizedCode } },
        ],
      },
    },
    { requireComplete: true },
  );
  const uniqueLessons = [...new Map(lessons.map((lesson) => [compactNotionId(lesson.id), lesson])).values()];
  if (uniqueLessons.length > 1) throw new LessonLookupConflictError(normalizedCode);
  return uniqueLessons[0] ?? null;
}

export async function getPublishedLessonById(pageId: string): Promise<LessonData | null> {
  const normalizedPageId = normalizeNotionPageId(pageId);
  if (!normalizedPageId) return null;

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error("NOTION_TOKEN is not set. Add it to your Vercel environment variables.");
  }

  const res = await fetch(`${NOTION_API}/pages/${normalizedPageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Notion lesson page error ${res.status}: ${detail}`);
  }

  const page = (await res.json()) as NotionPage;
  if (
    page.archived
    || page.in_trash
    || !belongsToLessonDatabase(page)
    || extractText(page.properties["Publish Workflow"]) !== "Published"
    || isExplicitlySkippedLesson(extractText(page.properties.Skip))
  ) {
    return null;
  }

  return mapPage(page, token, new Map<string, Promise<NotionPage>>());
}
