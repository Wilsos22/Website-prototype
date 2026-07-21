// One published lesson, public archive shape. Serves the /lessons/[id]
// detail page. The live-class links (warm-up and exit forms) are stripped:
// the archive is for reviewing a lesson, not for opening its collection
// surfaces outside class.
import { getPublishedLessonById } from "@/lib/notionLessons";
import { toPublicLessonData } from "@/lib/publicLessonData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const lesson = await getPublishedLessonById(id);
    if (!lesson) {
      return Response.json({ lesson: null }, { status: 404 });
    }
    const { warmUpLink: _warmUp, exitTicketLink: _exit, ...publicLesson } = toPublicLessonData(lesson);
    return Response.json({ lesson: publicLesson });
  } catch (err) {
    console.error("The archived lesson could not be loaded.", err);
    return Response.json({ error: "The lesson could not be loaded." }, { status: 500 });
  }
}
