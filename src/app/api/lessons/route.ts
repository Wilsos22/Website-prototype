// Returns all published lessons from the Math 6 Lessons Notion database (for archive).
import { getPublishedLessonArchive } from "@/lib/notionLessonArchive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const lessons = await getPublishedLessonArchive();
    return Response.json({
      lessons: lessons.map(({ exitTicketLink: _privateExitTicketLink, ...summary }) => summary),
    });
  } catch (err) {
    console.error("The public lesson archive could not be loaded.", err);
    return Response.json({ error: "Published lessons could not be loaded." }, { status: 500 });
  }
}
