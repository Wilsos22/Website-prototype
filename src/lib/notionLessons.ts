// Notion API integration for the Math 6 Lessons database (no SDK dependency — uses raw fetch).
// Requires NOTION_TOKEN env var (Notion internal integration token).
// Parent database ID: 613d13a5-ac90-4ab3-9f5f-b7da95911ec3
// Child data source IDs returned by Notion for this database.

const DATA_SOURCE_IDS = [
  "e367e541-c0c7-4613-8066-d2e61b6fee64",
  "3282eba1-de37-8069-a043-000b7c36799d",
  "d1c8e7b0-9a3c-4f1b-8c5c-9a2e5f0a1a3f",
];
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN= "secret";


export interface LessonData {
  id: string;
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
  discussionPrompt: string;
  practiceProblems: string;
  // Pre-planned reteach groups: one line per group, "misconception tag :: prepared move".
  // The Right-now view matches live clusters to these and shows YOUR plan first.
  misconceptionPlans: string;
  lessonSteps: LessonStepData[];
}

// Student-safe fields from the related Math 6 Lesson Steps records. Teacher
// notes, answer keys, and AI context are intentionally excluded because the
// lesson endpoints are also consumed by student-facing pages.
export interface LessonStepData {
  id: string;
  title: string;
  order: number;
  duration: number;
  startMinute: number;
  stateId: string;
  studentDirections: string;
  paperTask: string;
  question: string;
  pollKind: "short-answer" | "multiple-choice" | "fist-to-five" | "";
  choices: string[];
  tool: string;
  link: string;
  advance: "Automatic" | "Manual" | "";
  required: boolean;
}

interface RichTextItem {
  plain_text: string;
}

interface NotionProperty {
  type: string;
  number?: number | null;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  url?: string | null;
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  date?: { start: string; end?: string | null } | null;
  checkbox?: boolean;
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
  properties: Record<string, NotionProperty>;
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

function extractNumber(prop: NotionProperty | undefined): number {
  if (!prop) return 0;
  if (prop.type === "number") return prop.number ?? 0;
  if (prop.type === "formula" && prop.formula?.type === "number") return prop.formula.number ?? 0;
  if (prop.type === "rollup" && prop.rollup?.type === "number") return prop.rollup.number ?? 0;
  const parsed = Number(extractText(prop));
  return Number.isFinite(parsed) ? parsed : 0;
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

async function resolveLink(prop: NotionProperty | undefined, token: string, cache: Map<string, Promise<NotionPage>>): Promise<string> {
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

    const preferredRelatedProperties = [
      "Form Link",
      "Student Link",
      "Published Link",
      "Assignment Link",
      "Exit Ticket Link",
      "URL",
    ];

    for (const propertyName of preferredRelatedProperties) {
      const url = extractUrl(relatedPage.properties[propertyName]);
      if (url) return url;
    }

    const preferredNames = new Set(preferredRelatedProperties);
    for (const [propertyName, relatedProp] of Object.entries(relatedPage.properties)) {
      if (preferredNames.has(propertyName)) continue;
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
): Promise<string> {
  for (const name of names) {
    const link = await resolveLink(properties[name], token, cache);
    if (link) return link;
  }
  return "";
}

function mapLessonStep(page: NotionPage): LessonStepData {
  const p = page.properties;
  const pollKind = extractText(p["Poll Kind"]);
  return {
    id: page.id,
    title: extractText(p["Step"]),
    order: extractNumber(p["Order"]),
    duration: extractNumber(p["Duration"]),
    startMinute: extractNumber(p["Start Minute"]),
    stateId: extractText(p["State ID"]).trim(),
    studentDirections: extractText(p["Student Directions"]),
    paperTask: extractText(p["Paper Task"]),
    question: extractText(p["Question"]),
    pollKind: pollKind === "short-answer" || pollKind === "multiple-choice" || pollKind === "fist-to-five" ? pollKind : "",
    choices: extractText(p["Choices"]).split(/[\n,]+/).map((choice) => choice.trim()).filter(Boolean),
    tool: extractText(p["Tool"]),
    link: extractUrl(p["Link"]),
    advance: extractText(p["Advance"]) === "Automatic" ? "Automatic" : extractText(p["Advance"]) === "Manual" ? "Manual" : "",
    required: p["Required"]?.type === "checkbox" ? Boolean(p["Required"].checkbox) : false,
  };
}

async function resolveLessonSteps(
  prop: NotionProperty | undefined,
  token: string,
  cache: Map<string, Promise<NotionPage>>,
): Promise<LessonStepData[]> {
  if (prop?.type !== "relation") return [];
  const pages = await Promise.all((prop.relation ?? []).map(async (relation) => {
    try {
      return await fetchRelatedPage(relation.id, token, cache);
    } catch (err) {
      console.warn(err instanceof Error ? err.message : err);
      return null;
    }
  }));
  return pages
    .filter((page): page is NotionPage => Boolean(page))
    .map(mapLessonStep)
    .filter((step) => step.stateId && step.duration > 0)
    .sort((a, b) => a.order - b.order);
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

async function mapPage(page: NotionPage, token: string, cache: Map<string, Promise<NotionPage>>): Promise<LessonData> {
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
  const [warmUpLink, exitTicketLink, rawLessonSteps] = await Promise.all([
    resolveFirstLink(p, ["Warm Up Link", "Warm-Up Link", "Warm up links 1", "Warm-Up", "Warm Up"], token, cache),
    resolveFirstLink(p, ["Exit Ticket Link", "Exit-Ticket Link", "Exit Ticket", "Exit Ticket URL"], token, cache),
    resolveLessonSteps(p["Lesson Steps"], token, cache),
  ]);
  const lessonSteps = rawLessonSteps.map((step) => ({
    ...step,
    link: step.link || (step.stateId === "warmup" ? warmUpLink : step.stateId === "exit" ? exitTicketLink : ""),
  }));

  return {
    id: page.id,
    title: extractText(p["Lesson"]),
    subtitle: extractText(p["Subtitle"]),
    essentialIdeas: extractText(p["Essential Ideas"]),
    assignmentLink: await resolveFirstLink(p, ["Assignment Link", "Assignment", "Assignment URL"], token, cache),
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
    warmUpLink,
    exitTicketLink,
    learningIntention: extractText(p["Learning Intention"]),
    successCriteria: extractText(p["Success Criteria"]),
    discussionPrompt: extractText(p["Discussion Prompt"]),
    practiceProblems: extractText(p["Practice Problems"]),
    misconceptionPlans: extractText(p["Misconception Plans"]),
    lessonSteps,
  };
}

async function queryLessons(body: object): Promise<LessonData[]> {
  const token = process.env.NOTION_TOKEN;

  if (!token) {
    throw new Error("NOTION_TOKEN is not set. Add it to your Vercel environment variables.");
  }

  const lessons: LessonData[] = [];
  const errors: string[] = [];
  const relatedPageCache = new Map<string, Promise<NotionPage>>();

  for (const dataSourceId of DATA_SOURCE_IDS) {
    const res = await fetch(`${NOTION_API}/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      errors.push(`${dataSourceId}: Notion API error ${res.status}: ${detail}`);
      continue;
    }

    const data = (await res.json()) as { results: NotionPage[] };
    lessons.push(...await Promise.all(data.results.map((page) => mapPage(page, token, relatedPageCache))));
  }

  if (!lessons.length && errors.length === DATA_SOURCE_IDS.length) {
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

export async function getAllPublishedLessons(): Promise<LessonData[]> {
  return queryLessons({
    filter: {
      property: "Publish Workflow",
      select: { equals: "Published" },
    },
    sorts: [{ property: "Date", direction: "descending" }],
  });
}
