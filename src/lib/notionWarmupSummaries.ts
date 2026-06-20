// Formative warm-up analytics data layer.
//
// Two cheap sources instead of crunching every raw submission:
//   1. getWeeklySummaries() — the pre-computed "Warm-Up Weekly Summaries" DB
//      (per student / week: submitted vs expected, missing days, weekly avg,
//      completion, status). Small and purpose-built for triage.
//   2. getRecentWarmupForms() — the "Warm up Links" DB, so each day's form can
//      link straight to its Google Forms summary page (the rich native charts).
//
// Both are filtered server-side to a recent window and cached briefly, so the
// page loads fast and never does per-row relation lookups.

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

const FALLBACK_SUMMARIES_DATABASE_ID = "c5d7898bef0141bca60bf0398a2871a9";
const FALLBACK_LINKS_DATABASE_ID = "3142eba1de3780a29feedf404459c05b";

export interface WeeklySummary {
  id: string;
  student: string;
  studentEmail: string;
  period: string;
  week: string;
  weekNumber: number | null;
  weekStart: string;
  expectedDays: string;
  expectedNum: number | null;
  submittedCount: number | null;
  missingDays: string;
  weeklyAvgScore: number | null;
  completion: number | null; // normalized 0..100
  status: string; // "Complete" | "Missing Days" | "No Submissions"
}

export interface WarmupForm {
  id: string;
  name: string;
  className: string;
  date: string;
  formId: string;
  summaryUrl: string;
  editLink: string;
  formLink: string;
  responseSheet: string;
}

interface RichTextItem { plain_text: string }
interface NotionProperty {
  type: string;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  url?: string | null;
  email?: string | null;
  select?: { name: string } | null;
  multi_select?: { name: string }[];
  date?: { start: string } | null;
  number?: number | null;
  checkbox?: boolean;
}
interface NotionPage { id: string; properties: Record<string, NotionProperty> }
interface NotionQueryResponse { results: NotionPage[]; has_more?: boolean; next_cursor?: string | null }
interface NotionDatabaseResponse { id: string; data_sources?: { id: string }[] }

function cleanId(id: string): string { return id.trim().replace(/-/g, ""); }
function parseIdList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map(cleanId).filter(Boolean);
}

function txt(p: NotionProperty | undefined): string {
  if (!p) return "";
  if (p.type === "title") return p.title?.map((t) => t.plain_text).join("") ?? "";
  if (p.type === "rich_text") return p.rich_text?.map((t) => t.plain_text).join("") ?? "";
  if (p.type === "url") return p.url ?? "";
  if (p.type === "email") return p.email ?? "";
  if (p.type === "select") return p.select?.name ?? "";
  if (p.type === "multi_select") return p.multi_select?.map((s) => s.name).join(", ") ?? "";
  if (p.type === "date") return p.date?.start ?? "";
  if (p.type === "number") return p.number?.toString() ?? "";
  return "";
}
function num(p: NotionProperty | undefined): number | null {
  if (!p) return null;
  if (p.type === "number") return p.number ?? null;
  const n = Number(txt(p).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function getToken(): string {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new Error("NOTION_TOKEN is not set. Add it to .env.local and to your Vercel environment variables, then redeploy.");
  }
  return token;
}

async function resolveDataSourceIds(token: string, databaseId: string, explicitEnv?: string): Promise<string[]> {
  const explicit = parseIdList(explicitEnv);
  if (explicit.length) return explicit;
  const res = await fetch(`${NOTION_API}/databases/${cleanId(databaseId)}`, {
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Could not read database ${databaseId}. Share it with the Notion integration "Big Dog Math". Notion API ${res.status}: ${detail}`);
  }
  const db = (await res.json()) as NotionDatabaseResponse;
  const ids = db.data_sources?.map((s) => cleanId(s.id)).filter(Boolean) ?? [];
  if (!ids.length) throw new Error(`Database ${databaseId} returned no data sources.`);
  return ids;
}

async function queryAll(token: string, dataSourceId: string, body: Record<string, unknown>): Promise<NotionPage[]> {
  const out: NotionPage[] = [];
  let cursor: string | null | undefined;
  do {
    const res = await fetch(`${NOTION_API}/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Notion-Version": NOTION_VERSION },
      body: JSON.stringify({ page_size: 100, ...body, ...(cursor ? { start_cursor: cursor } : {}) }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Notion API ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as NotionQueryResponse;
    out.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return out;
}

function cutoffIso(sinceDays: number): string {
  const d = new Date(Date.now() - sinceDays * 86400000);
  return d.toISOString().slice(0, 10);
}

// --- tiny in-memory cache (per warm serverless instance) ---
interface CacheEntry<T> { at: number; key: string; data: T }
const TTL_MS = 5 * 60 * 1000;
let summariesCache: CacheEntry<WeeklySummary[]> | null = null;
let formsCache: CacheEntry<WarmupForm[]> | null = null;

export async function getWeeklySummaries(sinceDays = 14): Promise<WeeklySummary[]> {
  const cutoff = cutoffIso(sinceDays);
  const cacheKey = `s:${cutoff}`;
  if (summariesCache && summariesCache.key === cacheKey && Date.now() - summariesCache.at < TTL_MS) {
    return summariesCache.data;
  }
  const token = getToken();
  const dataSourceIds = await resolveDataSourceIds(
    token,
    process.env.NOTION_WARMUP_SUMMARIES_DATABASE_ID ?? FALLBACK_SUMMARIES_DATABASE_ID,
    process.env.NOTION_WARMUP_SUMMARIES_DATA_SOURCE_IDS,
  );
  const filter = { property: "Week Start", date: { on_or_after: cutoff } };

  const rows: WeeklySummary[] = [];
  for (const dsId of dataSourceIds) {
    const pages = await queryAll(token, dsId, { filter });
    for (const page of pages) {
      const p = page.properties;
      const submittedCount = num(p["Submitted Count"]);
      const expectedDays = txt(p["Expected Days"]);
      const expectedNum = num(p["Expected Days"]);
      let completion = num(p["Completion"]);
      if (completion !== null && completion <= 1) completion = completion * 100;
      rows.push({
        id: page.id,
        student: txt(p["Summary"]),
        studentEmail: txt(p["Student Email"]),
        period: txt(p["Period"]),
        week: txt(p["Week"]),
        weekNumber: num(p["Week Number"]),
        weekStart: txt(p["Week Start"]),
        expectedDays,
        expectedNum,
        submittedCount,
        missingDays: txt(p["Missing Days"]),
        weeklyAvgScore: num(p["Weekly Avg Score"]),
        completion: completion === null ? null : Math.round(completion),
        status: txt(p["Status"]),
      });
    }
  }
  summariesCache = { at: Date.now(), key: cacheKey, data: rows };
  return rows;
}

export async function getRecentWarmupForms(sinceDays = 14): Promise<WarmupForm[]> {
  const cutoff = cutoffIso(sinceDays);
  const cacheKey = `f:${cutoff}`;
  if (formsCache && formsCache.key === cacheKey && Date.now() - formsCache.at < TTL_MS) {
    return formsCache.data;
  }
  const token = getToken();
  let dataSourceIds: string[];
  try {
    dataSourceIds = await resolveDataSourceIds(
      token,
      process.env.NOTION_WARMUP_LINKS_DATABASE_ID ?? FALLBACK_LINKS_DATABASE_ID,
      process.env.NOTION_WARMUP_LINKS_DATA_SOURCE_IDS,
    );
  } catch {
    // Links DB not shared with this integration — daily summary links are optional.
    formsCache = { at: Date.now(), key: cacheKey, data: [] };
    return [];
  }
  const filter = { property: "Day", date: { on_or_after: cutoff } };

  const forms: WarmupForm[] = [];
  for (const dsId of dataSourceIds) {
    let pages: NotionPage[] = [];
    try { pages = await queryAll(token, dsId, { filter }); } catch { pages = []; }
    for (const page of pages) {
      const p = page.properties;
      const editLink = txt(p["Edit Link"]);
      let formId = txt(p["Key"]).trim();
      if (!formId) {
        const m = editLink.match(/\/forms\/d\/([^/]+)/);
        formId = m ? m[1] : "";
      }
      forms.push({
        id: page.id,
        name: txt(p["Name"]),
        className: txt(p["Class"]),
        date: txt(p["Day"]) || txt(p["Date"]),
        formId,
        summaryUrl: formId ? `https://docs.google.com/forms/d/${formId}/viewanalytics` : "",
        editLink,
        formLink: txt(p["Form Link"]),
        responseSheet: txt(p["Response Sheet"]),
      });
    }
  }
  forms.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  formsCache = { at: Date.now(), key: cacheKey, data: forms };
  return forms;
}
