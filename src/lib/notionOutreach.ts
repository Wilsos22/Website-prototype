// Notion side of parent outreach (server-only, NOTION_TOKEN). Reads the "All
// Contact Information" roster (which already has Parent 1 Email + warm-up stats)
// and writes Draft entries into the "Parent Contact Log" database. Setup: share
// BOTH databases with the Big Dog Math integration. The roster id comes from
// NOTION_ROSTER_DB_ID; the contact-log data source defaults below (override with
// NOTION_CONTACT_LOG_DS_ID).

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const CONTACT_LOG_DS = process.env.NOTION_CONTACT_LOG_DS_ID || "3ee76e55-afbb-4b40-88ef-da14db31ddca";

export interface OutreachStudent {
  pageId: string;
  name: string;
  email: string | null;
  parentEmail: string | null;
  period: string;
  warmupsSubmitted: number | null;
  warmupAvg: number | null;
}

interface NotionProp {
  type: string;
  title?: { plain_text: string }[];
  rich_text?: { plain_text: string }[];
  email?: string | null;
  select?: { name: string } | null;
  number?: number | null;
}
interface NotionPage { id: string; url?: string; properties: Record<string, NotionProp> }

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Notion-Version": NOTION_VERSION };
}
function text(p: NotionProp | undefined): string {
  if (!p) return "";
  if (p.type === "title") return (p.title || []).map((t) => t.plain_text).join("").trim();
  if (p.type === "rich_text") return (p.rich_text || []).map((t) => t.plain_text).join("").trim();
  if (p.type === "email") return (p.email || "").trim();
  if (p.type === "select") return p.select?.name?.trim() || "";
  return "";
}
function num(p: NotionProp | undefined): number | null {
  return p && p.type === "number" && p.number != null ? p.number : null;
}

export function outreachConfigured(): boolean {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_ROSTER_DB_ID);
}

// Read every student from the roster with the fields outreach needs.
export async function fetchOutreachRoster(): Promise<OutreachStudent[]> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_ROSTER_DB_ID;
  if (!token || !dbId) throw new Error("Notion roster is not configured (NOTION_TOKEN / NOTION_ROSTER_DB_ID).");

  const dbRes = await fetch(`${NOTION_API}/databases/${dbId}`, { headers: headers(token), cache: "no-store" });
  if (!dbRes.ok) throw new Error(`Notion roster lookup failed (${dbRes.status}) — is the roster shared with the integration?`);
  const db = (await dbRes.json()) as { data_sources?: { id: string }[] };
  const sourceIds = (db.data_sources || []).map((d) => d.id);
  if (!sourceIds.length) throw new Error("Roster database has no data sources.");

  const out: OutreachStudent[] = [];
  for (const sid of sourceIds) {
    let cursor: string | undefined;
    do {
      const res = await fetch(`${NOTION_API}/data_sources/${sid}/query`, {
        method: "POST", headers: headers(token),
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }), cache: "no-store",
      });
      if (!res.ok) throw new Error(`Notion roster query failed (${res.status}).`);
      const data = (await res.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };
      for (const page of data.results) {
        const p = page.properties;
        const titleKey = Object.keys(p).find((k) => p[k]?.type === "title");
        const name = titleKey ? text(p[titleKey]) : "";
        if (!name) continue;
        out.push({
          pageId: page.id,
          name,
          email: (text(p["Email"]) || text(p["Student Email"]) || "").toLowerCase() || null,
          parentEmail: text(p["Parent 1 Email"]) || text(p["Parent Email"]) || null,
          period: text(p["Class/Period"]) || text(p["Period"]) || text(p["Class"]) || "Unassigned",
          warmupsSubmitted: num(p["Warm-Ups Submitted"]),
          warmupAvg: num(p["Warm-Up Avg Score"]),
        });
      }
      cursor = data.has_more ? data.next_cursor || undefined : undefined;
    } while (cursor);
  }
  return out;
}

function rt(content: string) { return [{ text: { content: content.slice(0, 1990) } }]; }

export interface DraftInput {
  studentPageId: string;
  studentName: string;
  parentEmail: string | null;
  kind: "concern" | "praise" | "note";
  subject: string;
  body: string;
  date: string; // YYYY-MM-DD
}

// Create a Draft entry in the Parent Contact Log; returns the new page URL.
export async function createContactLogDraft(i: DraftInput): Promise<{ url: string }> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set.");
  const type = i.kind === "praise" ? "Praise" : i.kind === "concern" ? "Concern" : "Note";
  const properties: Record<string, unknown> = {
    "Summary": { title: rt(`${type} — ${i.studentName} — ${i.date}`) },
    "Student": { relation: [{ id: i.studentPageId }] },
    "Type": { select: { name: type } },
    "Status": { select: { name: "Draft" } },
    "Date": { date: { start: i.date } },
    "Subject": { rich_text: rt(i.subject) },
    "Message": { rich_text: rt(i.body) },
  };
  if (i.parentEmail) properties["Parent Email"] = { email: i.parentEmail };

  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST", headers: headers(token),
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: CONTACT_LOG_DS }, properties }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Notion draft create failed (${res.status}): ${detail.slice(0, 200)} — is the Parent Contact Log shared with the integration?`);
  }
  const data = (await res.json()) as { url?: string };
  return { url: data.url || "" };
}
