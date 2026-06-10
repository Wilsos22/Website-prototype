// Returns all published lessons from the Math 6 Lessons Notion database (for archive).
import { getAllPublishedLessons } from "@/lib/notionLessons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const lessons = await getAllPublishedLessons();
    return Response.json({ lessons });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
