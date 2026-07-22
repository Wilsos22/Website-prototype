import type { LessonData } from "./notionLessons";
import { publicSuccessCriterion } from "./successCriterion";

// The current-day student page may use these lesson-level fields. Lesson Steps
// stay private because the live session releases one state at a time.
const PUBLIC_TODAY_LESSON_FIELDS = [
  "id",
  "coverUrl",
  "lessonCode",
  "title",
  "subtitle",
  "essentialIdeas",
  "assignmentLink",
  "date",
  "dateEnd",
  "dueDate",
  "topic",
  "module",
  "moduleTopic",
  "standard",
  "agenda",
  "supplies",
  "tools",
  "suppliesConfigured",
  "toolsConfigured",
  "warmUpLink",
  "exitTicketLink",
  "learningIntention",
  "successCriteria",
  "selectedSuccessCriterion",
  "classroomMode",
  "discussionStems",
  "discussionVocabulary",
  "requiredPaperWork",
  "requiredDigitalWork",
  "optionalSupport",
  "bigDogChallenge",
  "dueAndTurnIn",
  "helpPath",
  "anchorProblem",
  "discussionPrompt",
  "practiceProblems",
] as const satisfies readonly (keyof LessonData)[];

// The archive is discoverable without teacher authentication. Keep it to the
// fields its cards need so scheduled lesson content and form links are not
// released before class.
const PUBLIC_ARCHIVE_LESSON_FIELDS = [
  "id",
  "lessonCode",
  "title",
  "subtitle",
  "essentialIdeas",
  "assignmentLink",
  "date",
  "dateEnd",
  "dueDate",
  "topic",
  "module",
  "moduleTopic",
  "standard",
] as const satisfies readonly (keyof LessonData)[];

type PublicTodayLessonField = (typeof PUBLIC_TODAY_LESSON_FIELDS)[number];
type PublicArchiveLessonField = (typeof PUBLIC_ARCHIVE_LESSON_FIELDS)[number];

export type PublicLessonData = Pick<LessonData, PublicTodayLessonField> & {
  steps: [];
};

export type PublicLessonSummary = Pick<LessonData, PublicArchiveLessonField>;

function pickFields<T extends object, K extends keyof T>(
  source: T,
  fields: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;

  for (const field of fields) {
    result[field] = source[field];
  }

  return result;
}

export function toPublicLessonData(lesson: LessonData): PublicLessonData {
  const criterion = publicSuccessCriterion(lesson.selectedSuccessCriterion);
  return {
    ...pickFields(lesson, PUBLIC_TODAY_LESSON_FIELDS),
    successCriteria: criterion,
    selectedSuccessCriterion: criterion,
    steps: [],
  };
}

export function toPublicLessonSummary(lesson: LessonData): PublicLessonSummary {
  return pickFields(lesson, PUBLIC_ARCHIVE_LESSON_FIELDS);
}
