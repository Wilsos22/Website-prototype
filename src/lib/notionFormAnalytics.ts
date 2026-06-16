// Notion API integration for Google Forms response tracking.
// Requires NOTION_TOKEN env var.

const DATA_SOURCE_IDS = [
  "78a5a644b26140b0a0695ea8cc342789",
];
const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

export interface FormResponseData {
  id: string;
  formTitle: string;
  responseEmail: string;
  submittedAt: string;
  score: number | null;
  maxScore: number | null;
  week: string;
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
  number?: number | null;
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
  if (prop.type === "number") return prop.number?.toString() ?? "";
  return "";
}

function extractNumber(prop: NotionProperty | undefined): number | null {
  if (!prop) return null;
  if (prop.type === "number") return prop.number ?? null;
  const text = extractText(prop).trim();
  if (!text) return null;
  const parsed = Number(text.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getIsoWeek(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  const weekNumber = 1 + Math.round(diff / 86400000 / 7);
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function parseFormResponse(page: NotionPage): FormResponseData {
  const p = page.properties;
  const responseEmail = extractText(p["Response Email"]) || extractText(p["Email"]) || extractText(p["Submitter"]);
  const submittedAt = extractText(p["Submitted At"]) || extractText(p["Submitted"]) || extractText(p["Timestamp"]);
  const score = extractNumber(p["Score"]) ?? extractNumber(p["Total Score"]) ?? null;
  const maxScore = extractNumber(p["Max Score"]) ?? null;
  const formTitle = extractText(p["Form Title"]) || extractText(p["Title"]) || "Untitled Form";

  return {
    id: page.id,
    formTitle,
    responseEmail,
    submittedAt,
    score,
    maxScore,
    week: getIsoWeek(submittedAt),
  };
}

export async function getAllFormResponses(): Promise<FormResponseData[]> {
  const token = process.env.NOTION_TOKEN;

  if (!token) {
    throw new Error("NOTION_TOKEN is not set. Add it to your Vercel environment variables.");
  }

  const responses: FormResponseData[] = [];
  const errors: string[] = [];

  for (const dataSourceId of DATA_SOURCE_IDS) {
    const res = await fetch(`${NOTION_API}/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify({
        sorts: [{ property: "Submitted At", direction: "descending" }],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      errors.push(`${dataSourceId}: Notion API error ${res.status}: ${detail}`);
      continue;
    }

    const data = (await res.json()) as { results: NotionPage[] };
    responses.push(...data.results.map(parseFormResponse));
  }

  if (!responses.length && errors.length === DATA_SOURCE_IDS.length) {
    throw new Error(errors.join(" | "));
  }

  return responses;
}

