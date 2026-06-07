// API route for creating, reading, and listing locally persisted question sessions.
import { createQuestionSession, getQuestionSession, listQuestionSessions } from "@/lib/questionStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim();

  if (!code) {
    const sessions = await listQuestionSessions();

    return Response.json(
      { sessions },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const session = await getQuestionSession(code);

  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  return Response.json(session, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { question?: string };
  const question = body.question?.trim();

  if (!question) {
    return Response.json({ error: "Question is required." }, { status: 400 });
  }

  const session = await createQuestionSession(question);
  return Response.json(session, { status: 201 });
}
