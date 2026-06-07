// API route for student answer submissions to an active locally persisted session.
import { addStudentResponse } from "@/lib/questionStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    code?: string;
    name?: string;
    answer?: string;
  };
  const code = body.code?.trim();
  const name = body.name?.trim();
  const answer = body.answer?.trim();

  if (!code || !name || !answer) {
    return Response.json({ error: "Code, name, and answer are required." }, { status: 400 });
  }

  try {
    const response = await addStudentResponse(code, name, answer);
    return Response.json(response, { status: 201 });
  } catch {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }
}
