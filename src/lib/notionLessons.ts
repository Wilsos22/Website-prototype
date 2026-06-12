// Notion API integration for the Math 6 Lessons database (no SDK dependency — uses raw fetch).
// Requires NOTION_TOKEN env var (Notion internal integration token).
// Database ID: e367e541-c0c7-4613-8066-d2e61b6fee64

const DB_ID = "e367e541-c0c7-4613-8066-d2e61b6fee64";
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

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
  return "";
}

function mapPage(page: NotionPage): LessonData {
  const p = page.properties;
  return {
    id: page.id,
    title: extractText(p["Lesson"]),
    subtitle: extractText(p["Subtitle"]),
    essentialIdeas: extractText(p["Essential Ideas"]),
    assignmentLink: extractText(p["Assignment Link"]),
    date: extractText(p["Date"]),
    dueDate: extractText(p["Due Date"]),
    topic: extractText(p["Topic"]),
    module: extractText(p["Module #"]),
  };
}

async function queryLessons(body: object): Promise<LessonData[]> {
  const token = process.env.NOTION_TOKEN;

  if (!token) {
    throw new Error("NOTION_TOKEN is not set. Add it to your Vercel environment variables.");
  }

  const res = await fetch(`${NOTION_API}/databases/${DB_ID}/query`, {
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
    throw new Error(`Notion API error ${res.status}: ${detail}`);
  }

  const data = (await res.json()) as { results: NotionPage[] };
  return data.results.map(mapPage);
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
