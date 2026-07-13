// Reads the class roster from the Notion "All Contact Information" database.
// Server-side only (NOTION_TOKEN). Setup: share the roster DB with the Big Dog
// Math integration and set NOTION_ROSTER_DB_ID in Vercel (the 32-char id from
// the database URL). Expected columns: a title property for the student name,
// "Email", and "Class/Period" (falls back to "Period" / "Class").

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const DEFAULT_ROSTER_DS_ID = "83e163c8-ce0a-4667-98ce-b9fd03d5717e";

export interface RosterRow {
  pageId: string;
  name: string;
  email: string | null;
  period: string;
}

interface NotionProp {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  email?: string | null;
  select?: { name: string } | null;
  number?: number | null;
  formula?: { type: string; string?: string | null; number?: number | null };
}
interface NotionPage { id: string; properties: Record<string, NotionProp> }

function text(p: NotionProp | undefined): string {
  if (!p) return "";
  if (p.type === "title") return (p.title || []).map((t) => t.plain_text).join("").trim();
  if (p.type === "rich_text") return (p.rich_text || []).map((t) => t.plain_text).join("").trim();
  if (p.type === "email") return (p.email || "").trim();
  if (p.type === "select") return p.select?.name?.trim() || "";
  if (p.type === "number") return p.number != null ? String(p.number) : "";
  if (p.type === "formula") return p.formula?.string?.trim() || (p.formula?.number != null ? String(p.formula.number) : "");
  return "";
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_VERSION,
  };
}

export async function fetchNotionRoster(): Promise<RosterRow[]> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_ROSTER_DB_ID;
  if (!token) throw new Error("NOTION_TOKEN is not set.");

  // Resolve the database's data sources (2025-09 API), then query each with pagination.
  let sourceIds = [process.env.NOTION_ROSTER_DS_ID || DEFAULT_ROSTER_DS_ID];
  if (dbId) {
    const dbRes = await fetch(`${NOTION_API}/databases/${dbId}`, { headers: headers(token), cache: "no-store" });
    if (!dbRes.ok) throw new Error(`Notion database lookup failed (${dbRes.status}) — is the roster DB shared with the integration?`);
    const db = (await dbRes.json()) as { data_sources?: { id: string }[] };
    sourceIds = (db.data_sources || []).map((d) => d.id);
    if (!sourceIds.length) throw new Error("Roster database has no data sources.");
  }

  const rows: RosterRow[] = [];
  for (const sid of sourceIds) {
    let cursor: string | undefined;
    do {
      const res = await fetch(`${NOTION_API}/data_sources/${sid}/query`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Notion roster query failed (${res.status}).`);
      const data = (await res.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };
      for (const page of data.results) {
        const p = page.properties;
        const titleKey = Object.keys(p).find((k) => p[k]?.type === "title");
        const name = titleKey ? text(p[titleKey]) : "";
        if (!name) continue;
        const email = (text(p["Email"]) || text(p["Student Email"]) || "").toLowerCase() || null;
        const period = text(p["Class/Period"]) || text(p["Period"]) || text(p["Class"]) || "Unassigned";
        rows.push({ pageId: page.id, name, email, period });
      }
      cursor = data.has_more ? data.next_cursor || undefined : undefined;
    } while (cursor);
  }
  return rows;
}
