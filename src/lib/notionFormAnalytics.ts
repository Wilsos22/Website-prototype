// Notion API integration for Google Forms response tracking.
// Requires NOTION_TOKEN env var.
// Use NOTION_WARMUP_DATA_SOURCE_IDS when you have actual Notion data source IDs.
// Use NOTION_WARMUP_DATABASE_ID when you only have the parent Notion database ID.

const FALLBACK_WARMUP_DATABASE_ID = "78a5a644b26140b0a0695ea8cc342789";
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

interface NotionDataSourceSummary {
  id: string;
}

interface NotionDatabaseResponse {
  id: string;
  data_sources?: NotionDataSourceSummary[];
}

function cleanNotionId(id: string): string {
  return id.trim().replace(/-/g, "");
}

function parseIdList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((id) => cleanNotionId(id))
    .filter(Boolean);
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

async function getWarmupDataSourceIds(token: string): Promise<string[]> {
  const explicitDataSourceIds = parseIdList(process.env.NOTION_WARMUP_DATA_SOURCE_IDS);
  if (explicitDataSourceIds.length > 0) return explicitDataSourceIds;

  const databaseId = cleanNotionId(process.env.NOTION_WARMUP_DATABASE_ID ?? FALLBACK_WARMUP_DATABASE_ID);
  const res = await fetch(`${NOTION_API}/databases/${databaseId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Could not read warm-up database ${databaseId}. Make sure this exact database is shared with the Notion integration named Big Dog Math. Notion API error ${res.status}: ${detail}`
    );
  }

  const database = (await res.json()) as NotionDatabaseResponse;
  const dataSourceIds = database.data_sources?.map((source) => cleanNotionId(source.id)).filter(Boolean) ?? [];

  if (!dataSourceIds.length) {
    throw new Error(
      `Warm-up database ${databaseId} loaded, but Notion did not return any data source IDs. Add NOTION_WARMUP_DATA_SOURCE_IDS in Vercel using the actual source ID for Today's Warm-Up Submissions.`
    );
  }

  return dataSourceIds;
}

export async function getAllFormResponses(): Promise<FormResponseData[]> {
  const token = process.env.NOTION_TOKEN;

  if (!token) {
    throw new Error("NOTION_TOKEN is not set. Add it to your local .env.local file and to your Vercel environment variables, then redeploy.");
  }

  const responses: FormResponseData[] = [];
  const errors: string[] = [];
  const dataSourceIds = await getWarmupDataSourceIds(token);

  for (const dataSourceId of dataSourceIds) {
    const res = await fetch(`${NOTION_API}/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify({}),
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

  if (!responses.length && errors.length === dataSourceIds.length) {
    throw new Error(errors.join(" | "));
  }

  return responses.sort((a, b) => {
    const aTime = new Date(a.submittedAt).getTime();
    const bTime = new Date(b.submittedAt).getTime();
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
  });
}
