// Notion API integration for Google Forms / warm-up response analytics.
// Requires NOTION_TOKEN env var.
// Uses the Today's Warm-Up Submissions database, then queries its data source.

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
  period?: string;
  group?: string;
  className?: string;
  needsFollowUp?: boolean;
  teacherNotes?: string;
  submissionKey?: string;
}

interface RichTextItem {
  plain_text: string;
}

interface NotionProperty {
  type: string;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  url?: string | null;
  email?: string | null;
  select?: { name: string } | null;
  date?: { start: string } | null;
  number?: number | null;
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

interface NotionDataSourceSummary {
  id: string;
}

interface NotionDatabaseResponse {
  id: string;
  data_sources?: NotionDataSourceSummary[];
}

interface NotionQueryResponse {
  results: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
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
  if (prop.type === "email") return prop.email ?? "";
  if (prop.type === "select") return prop.select?.name ?? "";
  if (prop.type === "date") return prop.date?.start ?? "";
  if (prop.type === "number") return prop.number?.toString() ?? "";
  if (prop.type === "formula") {
    if (prop.formula?.type === "string") return prop.formula.string ?? "";
    if (prop.formula?.type === "number") return prop.formula.number?.toString() ?? "";
    if (prop.formula?.type === "boolean") return prop.formula.boolean ? "true" : "false";
    if (prop.formula?.type === "date") return prop.formula.date?.start ?? "";
  }
  if (prop.type === "rollup") {
    if (prop.rollup?.type === "array") return prop.rollup.array?.map(extractText).filter(Boolean).join("\n") ?? "";
    if (prop.rollup?.type === "number") return prop.rollup.number?.toString() ?? "";
    if (prop.rollup?.type === "date") return prop.rollup.date?.start ?? "";
  }
  return "";
}

function extractNumber(prop: NotionProperty | undefined): number | null {
  if (!prop) return null;
  if (prop.type === "number") return prop.number ?? null;
  if (prop.type === "formula" && prop.formula?.type === "number") return prop.formula.number ?? null;
  if (prop.type === "rollup" && prop.rollup?.type === "number") return prop.rollup.number ?? null;

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

async function fetchRelatedPageTitle(pageId: string, token: string, cache: Map<string, Promise<string>>): Promise<string> {
  let cached = cache.get(pageId);
  if (!cached) {
    cached = fetch(`${NOTION_API}/pages/${pageId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
      },
      cache: "no-store",
    }).then(async (res) => {
      if (!res.ok) return "";
      const page = (await res.json()) as NotionPage;
      for (const prop of Object.values(page.properties)) {
        if (prop.type === "title") return extractText(prop);
      }
      return "";
    });
    cache.set(pageId, cached);
  }
  return cached;
}

async function extractRelationTitle(
  prop: NotionProperty | undefined,
  token: string,
  cache: Map<string, Promise<string>>,
): Promise<string> {
  if (prop?.type !== "relation") return "";
  const firstRelation = prop.relation?.[0];
  if (!firstRelation) return "";
  return fetchRelatedPageTitle(firstRelation.id, token, cache);
}

async function parseFormResponse(
  page: NotionPage,
  token: string,
  relatedTitleCache: Map<string, Promise<string>>,
): Promise<FormResponseData> {
  const p = page.properties;

  const warmUpTitle = await extractRelationTitle(p["Warm Up"], token, relatedTitleCache);
  const studentTitle = await extractRelationTitle(p["Student"], token, relatedTitleCache);

  const responseEmail =
    extractText(p["Email Address"]) ||
    extractText(p["Response Email"]) ||
    extractText(p["Email"]) ||
    studentTitle;

  const submittedAt =
    extractText(p["Submitted"]) ||
    extractText(p["Submitted At"]) ||
    extractText(p["Timestamp"]);

  const week = extractText(p["Week"]) || getIsoWeek(submittedAt);
  const score = extractNumber(p["Score"]);
  const maxScore = extractNumber(p["Max Score"]);
  const formTitle =
    warmUpTitle ||
    extractText(p["Warm Up Key"]) ||
    extractText(p["Submission Key"]) ||
    extractText(p["Form Title"]) ||
    "Warm Up";

  return {
    id: page.id,
    formTitle,
    responseEmail,
    submittedAt,
    score,
    maxScore,
    week,
    period: extractText(p["Period"]),
    group: extractText(p["Group"]),
    className: extractText(p["Class"]),
    needsFollowUp: Boolean(p["Needs Follow-Up"]?.checkbox),
    teacherNotes: extractText(p["Teacher Notes"]),
    submissionKey: extractText(p["Submission Key"]),
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
  const relatedTitleCache = new Map<string, Promise<string>>();

  for (const dataSourceId of dataSourceIds) {
    let nextCursor: string | null | undefined = undefined;

    do {
      const res = await fetch(`${NOTION_API}/data_sources/${dataSourceId}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_VERSION,
        },
        body: JSON.stringify({
          page_size: 100,
          ...(nextCursor ? { start_cursor: nextCursor } : {}),
        }),
        cache: "no-store",
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        errors.push(`${dataSourceId}: Notion API error ${res.status}: ${detail}`);
        break;
      }

      const data = (await res.json()) as NotionQueryResponse;
      responses.push(
        ...(await Promise.all(data.results.map((page) => parseFormResponse(page, token, relatedTitleCache))))
      );
      nextCursor = data.has_more ? data.next_cursor : null;
    } while (nextCursor);
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
