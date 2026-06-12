// API route for student answer submissions to an active locally persisted session.
import { addStudentResponse } from "@/lib/questionStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    code?: string;
    name?: string;
    answer?: string;
    rating?: number;
  };
  const code = body.code?.trim();
  const name = body.name?.trim();
  const answer = body.answer?.trim() ?? "";
  const rating = typeof body.rating === "number" ? body.rating : undefined;

  if (!code || !name) {
    return Response.json({ error: "Code and name are required." }, { status: 400 });
  }

  // For fist-to-five: rating must be 0-5. For questions: answer is required.
  if (rating === undefined && !answer) {
    return Response.json(
      { error: "Either an answer or a rating (0-5) is required." },
      { status: 400 },
    );
  }

  if (rating !== undefined && (rating < 0 || rating > 5 || !Number.isInteger(rating))) {
    return Response.json({ error: "Rating must be an integer 0-5." }, { status: 400 });
  }

  try {
    const response = await addStudentResponse(code, name, answer, rating);
    return Response.json(response, { status: 201 });
  } catch {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }
}
