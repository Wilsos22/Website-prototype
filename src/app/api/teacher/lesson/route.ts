import {
  getLessonByCode,
  getPublishedLessonById,
  LessonLookupConflictError,
} from "@/lib/notionLessons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pageId = params.get("id")?.trim() || "";
  const code = params.get("code")?.trim() || "";
  const compactPageId = pageId.replace(/-/g, "");

  if (pageId && !/^[0-9a-f]{32}$/i.test(compactPageId)) {
    return Response.json({ error: "Enter a valid Notion lesson ID." }, { status: 400 });
  }
  if (!pageId && (!code || code.length > 80)) {
    return Response.json({ error: "Enter a valid lesson code." }, { status: 400 });
  }

  try {
    if (pageId) {
      const lesson = await getPublishedLessonById(pageId);
      if (!lesson) {
        return Response.json(
          { error: "That published Notion lesson could not be found." },
          { status: 404 },
        );
      }
      return Response.json({ lesson });
    }

    const lesson = await getLessonByCode(code);
    return Response.json({ lesson });
  } catch (error) {
    if (error instanceof LessonLookupConflictError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Could not load the Notion lesson.";
    return Response.json({ error: message }, { status: 500 });
  }
}
