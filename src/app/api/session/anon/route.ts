// API route for anonymous student questions — teacher-only read, any student can submit.
import { addAnonQuestion, getAnonQuestions } from "@/lib/questionStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim();

  if (!code) {
    return Response.json({ error: "Code is required." }, { status: 400 });
  }

  try {
    const questions = await getAnonQuestions(code);
    return Response.json(
      { questions },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as { code?: string; text?: string };
  const code = body.code?.trim();
  const text = body.text?.trim();

  if (!code || !text) {
    return Response.json({ error: "Code and question text are required." }, { status: 400 });
  }

  try {
    const question = await addAnonQuestion(code, text);
    return Response.json(question, { status: 201 });
  } catch {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }
}
