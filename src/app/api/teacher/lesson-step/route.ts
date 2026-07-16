import {
  getPublishedLessonStep,
  LessonStepApiError,
  updatePublishedLessonStep,
} from "@/lib/notionLessonStepWrites";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreHeaders(retryAfter?: string): HeadersInit {
  return {
    "cache-control": "no-store",
    ...(retryAfter ? { "retry-after": retryAfter } : {}),
  };
}

function errorResponse(error: unknown): Response {
  if (error instanceof LessonStepApiError) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
        ...(error.currentStep ? { currentStep: error.currentStep } : {}),
      },
      { status: error.status, headers: noStoreHeaders(error.retryAfter) },
    );
  }
  console.error("Lesson Step API failed without a recognized error type.");
  return Response.json(
    { error: "The lesson-step request could not be completed.", code: "LESSON_STEP_ERROR" },
    { status: 500, headers: noStoreHeaders() },
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const step = await getPublishedLessonStep(params.get("lessonId"), params.get("stepId"));
    return Response.json({ step }, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) {
    return Response.json(
      { error: "Send a valid JSON lesson-step update.", code: "INVALID_JSON" },
      { status: 400, headers: noStoreHeaders() },
    );
  }

  try {
    const step = await updatePublishedLessonStep({
      lessonId: body.lessonId,
      stepId: body.stepId,
      expectedLastEditedTime: body.expectedLastEditedTime,
      changes: body.changes,
    });
    return Response.json({ step }, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}
