// Returns today's published lesson from the Math 6 Lessons Notion database.
import { getTodayLesson } from "@/lib/notionLessons";
import { toPublicLessonData } from "@/lib/publicLessonData";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLASSROOM_TIME_ZONE = "America/Los_Angeles";

function getClassroomDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLASSROOM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function GET() {
  const today = getClassroomDate(); // YYYY-MM-DD in the classroom timezone

  try {
    const lesson = await getTodayLesson(today);

    if (!lesson) {
      return Response.json({ lesson: null, date: today });
    }

    return Response.json({ lesson: toPublicLessonData(lesson), date: today });
  } catch (err) {
    console.error("The public current-day lesson could not be loaded.", err);
    return Response.json({ error: "Today's lesson could not be loaded." }, { status: 500 });
  }
}
