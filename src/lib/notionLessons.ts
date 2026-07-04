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
  date: string;       // ISO date string
  dueDate: string;    // ISO date string
  topic: string;
  module: string;
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
  date?: { start: string } | null;
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

    for (const relatedProp of Object.values(relatedPage.properties)) {
      const url = extractUrl(relatedProp);
      if (url) return url;
    }
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

  return {
    id: page.id,
    title: extractText(p["Lesson"]),
    subtitle: extractText(p["Subtitle"]),
    essentialIdeas: extractText(p["Essential Ideas"]),
    assignmentLink: await resolveLink(p["Assignment Link"], token, cache),
    date: extractText(p["Date"]),
    dueDate: extractText(p["Due Date"]),
    topic: extractText(p["Topic"]),
    module: extractText(p["Module #"]),
    agenda: extractText(p["Agenda"]),
    supplies: uniq([...splitList(supplyText), ...checkedSupplies]).join("\n"),
    tools: uniq([...splitList(toolText), ...checkedTools]).join("\n"),
    suppliesConfigured: Boolean(supplyText.trim()) || hasSupplyCheckboxes,
    toolsConfigured: Boolean(toolText.trim()) || hasToolCheckboxes,
    warmUpLink: await resolveLink(p["Warm Up Link"], token, cache),
    exitTicketLink: await resolveLink(p["Exit Ticket Link"], token, cache),
    learningIntention: extractText(p["Learning Intention"]),
    successCriteria: extractText(p["Success Criteria"]),
    discussionPrompt: extractText(p["Discussion Prompt"]),
    practiceProblems: extractText(p["Practice Problems"]),
    misconceptionPlans: extractText(p["Misconception Plans"]),
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
