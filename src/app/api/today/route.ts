// Returns today's published lesson from the Math 6 Lessons Notion database.
import { getTodayLesson } from "@/lib/notionLessons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  try {
    const lesson = await getTodayLesson(today);

    if (!lesson) {
      return Response.json({ lesson: null, date: today });
    }

    return Response.json({ lesson, date: today });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
