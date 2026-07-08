// Writes a day's in-app tool work into the Notion "Student Submissions" database
// (server-only, NOTION_TOKEN). Student is a plain text field there, so no
// student-page mapping is needed. Data source id defaults below; override with
// NOTION_SUBMISSIONS_DS_ID. Share the Student Submissions DB with the integration.

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const SUBMISSIONS_DS = process.env.NOTION_SUBMISSIONS_DS_ID || "bf89a344-70dd-4b4f-ae49-fdef289be085";

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Notion-Version": NOTION_VERSION };
}
function rt(content: string) { return [{ text: { content: content.slice(0, 1990) } }]; }

export function submissionsConfigured(): boolean {
  return Boolean(process.env.NOTION_TOKEN);
}

// The Submission titles already logged today, so a re-run doesn't duplicate.
export async function fetchTodaysSubmissionTitles(dateIso: string): Promise<Set<string>> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return new Set();
  const titles = new Set<string>();
  let cursor: string | undefined;
  do {
    const res = await fetch(`${NOTION_API}/data_sources/${SUBMISSIONS_DS}/query`, {
      method: "POST", headers: headers(token),
      body: JSON.stringify({
        page_size: 100,
        filter: { and: [{ property: "Source", select: { equals: "Big Dog Math" } }, { property: "Date", date: { equals: dateIso } }] },
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) return titles; // best-effort dedupe; a query failure just means we might re-add
    const data = (await res.json()) as { results: { properties?: Record<string, { title?: { plain_text: string }[] }> }[]; has_more: boolean; next_cursor: string | null };
    for (const p of data.results) {
      const t = (p.properties?.["Submission"]?.title || []).map((x) => x.plain_text).join("").trim();
      if (t) titles.add(t);
    }
    cursor = data.has_more ? data.next_cursor || undefined : undefined;
  } while (cursor);
  return titles;
}

export interface SubmissionInput {
  title: string;
  student: string;
  period: string | null;   // "P1".."P7" or null
  response: string;
  misconception: boolean;
  dateIso: string;
}

export async function createSubmissionRow(i: SubmissionInput): Promise<void> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set.");
  const properties: Record<string, unknown> = {
    "Submission": { title: rt(i.title) },
    "Student": { rich_text: rt(i.student) },
    "Source": { select: { name: "Big Dog Math" } },
    "Submission Type": { select: { name: "Practice" } },
    "Status": { status: { name: "Done" } },
    "Response": { rich_text: rt(i.response) },
    "Misconception Flag": { select: { name: i.misconception ? "Other" : "None" } },
    "Date": { date: { start: i.dateIso } },
  };
  if (i.period) properties["Period"] = { select: { name: i.period } };

  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST", headers: headers(token),
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: SUBMISSIONS_DS }, properties }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Notion submission create failed (${res.status}): ${detail.slice(0, 160)} — is the Student Submissions DB shared with the integration?`);
  }
}
