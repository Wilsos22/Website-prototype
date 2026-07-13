import { getLessonByCode } from "@/lib/notionLessons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim() || "";
  if (!code || code.length > 80) {
    return Response.json({ error: "Enter a valid lesson code." }, { status: 400 });
  }
  try {
    const lesson = await getLessonByCode(code);
    return Response.json({ lesson });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the Notion lesson.";
    return Response.json({ error: message }, { status: 500 });
  }
}
