// Compact, server-side reader for the published Math 6 lesson archive.
// The default path never follows relations; callers can opt into either link relation independently.

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";
const MATH_6_LESSONS_DATA_SOURCE_ID = "e367e541-c0c7-4613-8066-d2e61b6fee64";

export interface PublishedLessonArchiveItem {
  id: string;
  lessonCode: string;
  title: string;
  subtitle: string;
  essentialIdeas: string;
  assignmentLink: string;
  date: string;
  dateEnd: string;
  dueDate: string;
  topic: string;
  module: string;
  moduleTopic: string;
  standard: string;
  exitTicketLink: string;
}

export interface PublishedLessonArchiveOptions {
  /** Follow an Assignment relation when its property has no direct URL. */
  resolveAssignmentLink?: boolean;
  /** Follow an Exit Ticket relation when its property has no direct URL. */
  resolveExitTicketLink?: boolean;
}

interface RichTextItem {
  plain_text?: string;
  href?: string | null;
  text?: { link?: { url?: string } | null };
}

interface NotionProperty {
  type?: string;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  url?: string | null;
  select?: { name?: string } | null;
  multi_select?: { name?: string }[];
  date?: { start?: string; end?: string | null } | null;
  relation?: { id?: string }[];
  formula?: {
    type?: string;
    string?: string | null;
    number?: number | null;
    date?: { start?: string; end?: string | null } | null;
  };
  rollup?: {
    type?: string;
    array?: NotionProperty[];
    number?: number | null;
    date?: { start?: string; end?: string | null } | null;
  };
}

interface NotionPage {
  id: string;
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, NotionProperty>;
}

interface NotionQueryResponse {
  results?: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
}

type RelatedPageCache = Map<string, Promise<NotionPage | null>>;

const RELATED_PAGE_RETRY_DELAYS_MS = [150, 400] as const;

const ASSIGNMENT_PROPERTY_NAMES = ["Assignment Link", "Assignment", "Assignment URL"];
const EXIT_TICKET_PROPERTY_NAMES = ["Exit Ticket Link", "Exit-Ticket Link", "Exit Ticket", "Exit Ticket URL"];
const CCSS_RE = /\b[3-8]\.(?:NS|RP|EE|G|SP|NBT|NF|OA|MD)\.[A-Za-z0-9.]+/;

function richTextValue(items: RichTextItem[] | undefined): string {
  return items?.map((item) => item.plain_text ?? "").join("") ?? "";
}

function propertyText(property: NotionProperty | undefined): string {
  if (!property) return "";
  if (property.type === "title") return richTextValue(property.title);
  if (property.type === "rich_text") return richTextValue(property.rich_text);
  if (property.type === "url") return property.url ?? "";
  if (property.type === "select") return property.select?.name ?? "";
  if (property.type === "multi_select") {
    return property.multi_select?.map((option) => option.name ?? "").filter(Boolean).join(", ") ?? "";
  }
  if (property.type === "date") return property.date?.start ?? "";
  if (property.type === "formula") {
    if (property.formula?.type === "string") return property.formula.string ?? "";
    if (property.formula?.type === "number") return property.formula.number?.toString() ?? "";
    if (property.formula?.type === "date") return property.formula.date?.start ?? "";
  }
  if (property.type === "rollup") {
    if (property.rollup?.type === "array") {
      return property.rollup.array?.map(propertyText).filter(Boolean).join("\n") ?? "";
    }
    if (property.rollup?.type === "number") return property.rollup.number?.toString() ?? "";
    if (property.rollup?.type === "date") return property.rollup.date?.start ?? "";
  }
  return "";
}

function firstPropertyText(properties: Record<string, NotionProperty>, names: string[]): string {
  for (const name of names) {
    const value = propertyText(properties[name]).trim();
    if (value) return value;
  }
  return "";
}

function firstUrlInText(value: string): string {
  return value.match(/https?:\/\/[^\s<>"']+/)?.[0]?.replace(/[),.;]+$/, "") ?? "";
}

function safeHttpUrl(value: string | null | undefined): string {
  const candidate = value?.trim() ?? "";
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function propertyUrl(property: NotionProperty | undefined): string {
  if (!property) return "";
  if (property.type === "url") return safeHttpUrl(property.url);

  if (property.type === "title" || property.type === "rich_text") {
    const items = property.type === "title" ? property.title : property.rich_text;
    for (const item of items ?? []) {
      const linkedUrl = item.href || item.text?.link?.url;
      const safeLinkedUrl = safeHttpUrl(linkedUrl);
      if (safeLinkedUrl) return safeLinkedUrl;
    }
    return safeHttpUrl(firstUrlInText(richTextValue(items)));
  }

  if (property.type === "formula" && property.formula?.type === "string") {
    return safeHttpUrl(firstUrlInText(property.formula.string ?? ""));
  }

  if (property.type === "rollup" && property.rollup?.type === "array") {
    for (const item of property.rollup.array ?? []) {
      const url = propertyUrl(item);
      if (url) return url;
    }
  }

  return "";
}

function firstDirectUrl(properties: Record<string, NotionProperty>, names: string[]): string {
  for (const name of names) {
    const url = propertyUrl(properties[name]);
    if (url) return url;
  }
  return "";
}

function firstRelationIds(properties: Record<string, NotionProperty>, names: string[]): string[] {
  for (const name of names) {
    const property = properties[name];
    if (property?.type !== "relation") continue;
    return (property.relation ?? [])
      .map((relation) => relation.id?.trim() ?? "")
      .filter(Boolean);
  }
  return [];
}

function dateEnd(property: NotionProperty | undefined): string {
  if (property?.type === "date") return property.date?.end ?? "";
  if (property?.type === "formula" && property.formula?.type === "date") {
    return property.formula.date?.end ?? "";
  }
  if (property?.type === "rollup" && property.rollup?.type === "date") {
    return property.rollup.date?.end ?? "";
  }
  return "";
}

function standardValue(properties: Record<string, NotionProperty>): string {
  for (const property of Object.values(properties)) {
    const match = propertyText(property).match(CCSS_RE);
    if (match) return match[0];
  }
  return firstPropertyText(properties, ["Standard", "Standards"]);
}

function mapCompactPage(page: NotionPage): PublishedLessonArchiveItem {
  const properties = page.properties ?? {};
  return {
    id: page.id,
    lessonCode: propertyText(properties["Lesson Code"]),
    title: propertyText(properties["Lesson"]),
    subtitle: propertyText(properties["Subtitle"]),
    essentialIdeas: propertyText(properties["Essential Ideas"]),
    assignmentLink: firstDirectUrl(properties, ASSIGNMENT_PROPERTY_NAMES),
    date: propertyText(properties["Date"]),
    dateEnd: dateEnd(properties["Date"]),
    dueDate: propertyText(properties["Due Date"]),
    topic: firstPropertyText(properties, ["Topic", "Topic #", "Topic Code"]),
    module: firstPropertyText(properties, ["Module #", "Module"]),
    moduleTopic: firstPropertyText(properties, ["Module Topic", "Module topic", "Unit Topic", "Topic Name", "Lesson Topic"]),
    standard: standardValue(properties),
    exitTicketLink: firstDirectUrl(properties, EXIT_TICKET_PROPERTY_NAMES),
  };
}

function getToken(): string {
  const token = process.env.NOTION_TOKEN?.trim();
  if (!token) {
    throw new Error("NOTION_TOKEN is not set. Add it to your Vercel environment variables.");
  }
  return token;
}

async function readJson<T>(response: Response, errorMessage: string): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new Error(errorMessage);
  }
}

async function queryPublishedLessonPages(token: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  do {
    let response: Response;
    try {
      response = await fetch(`${NOTION_API}/data_sources/${MATH_6_LESSONS_DATA_SOURCE_ID}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Notion-Version": NOTION_VERSION,
        },
        body: JSON.stringify({
          page_size: 100,
          filter: {
            property: "Publish Workflow",
            select: { equals: "Published" },
          },
          sorts: [{ property: "Date", direction: "descending" }],
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
        cache: "no-store",
      });
    } catch {
      throw new Error("The Notion lesson archive request failed.");
    }

    if (!response.ok) {
      throw new Error(`The Notion lesson archive query failed with status ${response.status}.`);
    }

    const data = await readJson<NotionQueryResponse>(response, "The Notion lesson archive returned an invalid response.");
    const results = Array.isArray(data.results) ? data.results : [];
    pages.push(...results.filter((page) => page && typeof page.id === "string" && !page.archived && !page.in_trash));

    if (!data.has_more) {
      cursor = null;
      continue;
    }

    const nextCursor = typeof data.next_cursor === "string" ? data.next_cursor.trim() : "";
    if (!nextCursor || nextCursor === cursor) {
      throw new Error("The Notion lesson archive pagination cursor was invalid.");
    }
    cursor = nextCursor;
  } while (cursor);

  return pages;
}

async function fetchRelatedPage(pageId: string, token: string, cache: RelatedPageCache): Promise<NotionPage | null> {
  const cached = cache.get(pageId);
  if (cached) return cached;

  const request = (async () => {
    for (let attempt = 0; attempt <= RELATED_PAGE_RETRY_DELAYS_MS.length; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${NOTION_API}/pages/${encodeURIComponent(pageId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": NOTION_VERSION,
          },
          cache: "no-store",
        });
      } catch {
        if (attempt === RELATED_PAGE_RETRY_DELAYS_MS.length) {
          throw new Error("A related Notion page could not be reached.");
        }
        await new Promise((resolve) => setTimeout(resolve, RELATED_PAGE_RETRY_DELAYS_MS[attempt]));
        continue;
      }

      if (response.status === 404) return null;

      const retryable = response.status === 429 || response.status >= 500;
      if (!response.ok && retryable && attempt < RELATED_PAGE_RETRY_DELAYS_MS.length) {
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? Math.min(retryAfterSeconds * 1000, 2_000)
          : RELATED_PAGE_RETRY_DELAYS_MS[attempt];
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`A related Notion page request failed with status ${response.status}.`);
      }

      const page = await readJson<NotionPage>(response, "A related Notion page returned an invalid response.");
      if (!page || typeof page.id !== "string" || page.archived || page.in_trash) return null;
      return page;
    }

    throw new Error("A related Notion page could not be reached.");
  })();

  cache.set(pageId, request);
  return request;
}

async function relationFormLink(
  properties: Record<string, NotionProperty>,
  propertyNames: string[],
  token: string,
  cache: RelatedPageCache,
): Promise<string> {
  for (const pageId of firstRelationIds(properties, propertyNames)) {
    const relatedPage = await fetchRelatedPage(pageId, token, cache);
    if (!relatedPage) continue;
    const formLink = propertyUrl(relatedPage.properties?.["Form Link"]);
    if (formLink) return formLink;
  }
  return "";
}

/**
 * Return every published Math 6 lesson as compact archive metadata.
 *
 * Direct link properties are read without additional requests. Relation targets
 * are followed only for the explicitly enabled link type, one at a time, with a
 * shared cache so the same related page is never requested twice per call.
 */
export async function getPublishedLessonArchive(
  options: PublishedLessonArchiveOptions = {},
): Promise<PublishedLessonArchiveItem[]> {
  const token = getToken();
  const pages = await queryPublishedLessonPages(token);
  const lessons = pages.map(mapCompactPage);

  if (!options.resolveAssignmentLink && !options.resolveExitTicketLink) {
    return lessons;
  }

  const relatedPageCache: RelatedPageCache = new Map();

  // Keep relation reads sequential. This path is teacher-facing and correctness
  // matters more than sending a burst of requests to Notion.
  for (let index = 0; index < pages.length; index += 1) {
    const properties = pages[index].properties ?? {};
    const lesson = lessons[index];

    if (options.resolveAssignmentLink && !lesson.assignmentLink) {
      lesson.assignmentLink = await relationFormLink(
        properties,
        ASSIGNMENT_PROPERTY_NAMES,
        token,
        relatedPageCache,
      );
    }

    if (options.resolveExitTicketLink && !lesson.exitTicketLink) {
      lesson.exitTicketLink = await relationFormLink(
        properties,
        EXIT_TICKET_PROPERTY_NAMES,
        token,
        relatedPageCache,
      );
    }
  }

  return lessons;
}

export const NOTION_LESSON_ARCHIVE_CONTRACT = {
  dataSourceId: MATH_6_LESSONS_DATA_SOURCE_ID,
  notionVersion: NOTION_VERSION,
} as const;
