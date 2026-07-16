import { getPublishedLessonsForDateRange, type LessonData } from "@/lib/notionLessons";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CLASSROOM_TIME_ZONE = "America/Los_Angeles";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

interface DisplayLesson {
  id: string;
  lessonCode: string;
  title: string;
  standard: string;
  learningIntention: string;
  successCriteria: string;
  discussionVocabulary: string;
  topic: string;
  moduleTopic: string;
  classroomMode: string;
}

function classroomDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLASSROOM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(isoDate: string, offset: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + offset, 12));
  return value.toISOString().slice(0, 10);
}

function weekStartFor(isoDate: string): string {
  const weekday = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return shiftDate(isoDate, mondayOffset);
}

function appliesToDate(lesson: LessonData, isoDate: string): boolean {
  const start = lesson.date.slice(0, 10);
  if (!start) return false;
  const end = lesson.dateEnd.slice(0, 10) || start;
  return start <= isoDate && isoDate <= end;
}

function contentScore(lesson: LessonData): number {
  return Number(Boolean(lesson.learningIntention.trim()))
    + Number(Boolean((lesson.selectedSuccessCriterion || lesson.successCriteria).trim()));
}

function displayLesson(lesson: LessonData): DisplayLesson {
  return {
    id: lesson.id,
    lessonCode: lesson.lessonCode,
    title: lesson.title,
    standard: lesson.standard,
    learningIntention: lesson.learningIntention,
    successCriteria: lesson.selectedSuccessCriterion || lesson.successCriteria,
    discussionVocabulary: lesson.discussionVocabulary,
    topic: lesson.topic,
    moduleTopic: lesson.moduleTopic,
    classroomMode: lesson.classroomMode,
  };
}

export async function GET() {
  const today = classroomDate();
  const weekStart = weekStartFor(today);
  const weekEnd = shiftDate(weekStart, 4);

  try {
    const lessons = await getPublishedLessonsForDateRange(weekStart, weekEnd);
    const uniqueLessons = [...new Map(lessons.map((lesson) => [lesson.id.replace(/-/g, ""), lesson])).values()];
    const days = WEEKDAYS.map((weekday, index) => {
      const date = shiftDate(weekStart, index);
      const matchingLessons = uniqueLessons
        .filter((lesson) => appliesToDate(lesson, date))
        .sort((left, right) => (
          contentScore(right) - contentScore(left)
          || Number(right.date.slice(0, 10) === date) - Number(left.date.slice(0, 10) === date)
          || left.lessonCode.localeCompare(right.lessonCode)
        ));

      return {
        weekday,
        date,
        lessons: matchingLessons.map(displayLesson),
      };
    });

    return Response.json(
      {
        today,
        timeZone: CLASSROOM_TIME_ZONE,
        weekStart,
        weekEnd,
        days,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message, today }, { status: 500 });
  }
}
