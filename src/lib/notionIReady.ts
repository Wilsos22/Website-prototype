// Server-only writer for the Notion i-Ready Evaluations database.

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const IREADY_DS_ID = process.env.NOTION_IREADY_DS_ID || "675b4b8b-d6bf-4d99-a449-2b25378978bb";

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Notion-Version": NOTION_VERSION };
}

function richText(content: string) {
  return [{ text: { content: content.slice(0, 1990) } }];
}

export interface IReadyEvaluationInput {
  title: string;
  studentPageId: string;
  window: "Fall" | "Winter" | "Spring";
  domains: Record<string, number>;
  strengths: string;
  growthAreas: string;
  notes: string;
}

export async function fetchIReadyEvaluationPages(): Promise<Map<string, string>> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set.");
  const pages = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const response = await fetch(`${NOTION_API}/data_sources/${IREADY_DS_ID}/query`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Notion i-Ready query failed (${response.status}).`);
    const data = await response.json() as {
      results: { id: string; properties: Record<string, { title?: { plain_text: string }[] }> }[];
      has_more: boolean;
      next_cursor: string | null;
    };
    for (const page of data.results) {
      const title = (page.properties.Evaluation?.title || []).map((item) => item.plain_text).join("").trim();
      if (title) pages.set(title, page.id);
    }
    cursor = data.has_more ? data.next_cursor || undefined : undefined;
  } while (cursor);
  return pages;
}

export async function writeIReadyEvaluation(input: IReadyEvaluationInput, pageId?: string): Promise<"created" | "updated"> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set.");
  const properties: Record<string, unknown> = {
    Evaluation: { title: richText(input.title) },
    Student: { relation: [{ id: input.studentPageId }] },
    Window: { select: { name: input.window } },
    Strengths: { rich_text: richText(input.strengths) },
    "Growth Areas": { rich_text: richText(input.growthAreas) },
    "Evaluation Notes": { rich_text: richText(input.notes) },
    "Last Synced": { date: { start: new Date().toISOString() } },
  };
  const domainProperties: Record<string, string> = {
    "Number and Operations": "Number and Operations",
    "Algebra and Algebraic Thinking": "Algebra and Algebraic Thinking",
    "Measurement and Data": "Measurement and Data",
    Geometry: "Geometry",
  };
  for (const [domain, property] of Object.entries(domainProperties)) {
    const score = input.domains[domain];
    if (Number.isFinite(score)) properties[property] = { number: score };
  }

  const response = await fetch(pageId ? `${NOTION_API}/pages/${pageId}` : `${NOTION_API}/pages`, {
    method: pageId ? "PATCH" : "POST",
    headers: headers(token),
    body: JSON.stringify(pageId
      ? { properties }
      : { parent: { type: "data_source_id", data_source_id: IREADY_DS_ID }, properties }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Notion i-Ready write failed (${response.status}): ${detail.slice(0, 180)}`);
  }
  return pageId ? "updated" : "created";
}
