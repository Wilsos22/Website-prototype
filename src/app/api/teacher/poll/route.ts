import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type PollAction =
  | {
      action: "create";
      sessionId?: unknown;
      question?: unknown;
      choices?: unknown;
      kind?: unknown;
      correctAnswer?: unknown;
      lessonCode?: unknown;
      notionLessonId?: unknown;
      notionStepId?: unknown;
      standardId?: unknown;
    }
  | { action: "close"; pollId?: unknown };

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const pollId = new URL(request.url).searchParams.get("pollId") || "";
  if (!pollId) return Response.json({ error: "Poll is required." }, { status: 400 });

  const { data, error } = await db
    .from("poll_answers")
    .select("id,student_id,display_name,answer,created_at")
    .eq("poll_id", pollId)
    .order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ answers: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as PollAction;

  if (body.action === "create") {
    const sessionId = text(body.sessionId, 80);
    const question = text(body.question, 2000);
    const choices = Array.isArray(body.choices)
      ? body.choices.filter((choice): choice is string => typeof choice === "string").map((choice) => text(choice, 500)).filter(Boolean).slice(0, 12)
      : null;
    const kind = ["short-answer", "multiple-choice", "fist-to-five"].includes(text(body.kind, 40))
      ? text(body.kind, 40)
      : "short-answer";
    if (!sessionId || !question) return Response.json({ error: "Session and question are required." }, { status: 400 });

    const { data: session, error: sessionError } = await db.from("sessions").select("id,status").eq("id", sessionId).maybeSingle();
    if (sessionError) return Response.json({ error: sessionError.message }, { status: 500 });
    if (!session || session.status !== "open") return Response.json({ error: "Open session not found." }, { status: 404 });

    const closeResult = await db.from("polls").update({ status: "closed" }).eq("session_id", sessionId).eq("status", "open");
    if (closeResult.error) return Response.json({ error: closeResult.error.message }, { status: 500 });

    const { data, error: insertError } = await db
      .from("polls")
      .insert({
        session_id: sessionId,
        question,
        choices: choices?.length ? choices : null,
        kind,
        status: "open",
        correct_answer: text(body.correctAnswer, 1000) || null,
        lesson_code: text(body.lessonCode, 80) || null,
        notion_lesson_id: text(body.notionLessonId, 120) || null,
        notion_step_id: text(body.notionStepId, 120) || null,
        standard_id: text(body.standardId, 80) || null,
      })
      .select("id,session_id,question,choices,kind,status,created_at")
      .single();
    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });
    return Response.json({ poll: data }, { status: 201 });
  }

  if (body.action === "close") {
    const pollId = text(body.pollId, 80);
    if (!pollId) return Response.json({ error: "Poll is required." }, { status: 400 });
    const { data, error } = await db
      .from("polls")
      .update({ status: "closed" })
      .eq("id", pollId)
      .select("id")
      .maybeSingle();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Poll not found." }, { status: 404 });
    return Response.json({ closed: true });
  }

  return Response.json({ error: "Unknown poll action." }, { status: 400 });
}
