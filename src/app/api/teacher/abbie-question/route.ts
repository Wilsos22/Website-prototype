import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
  if (!sessionId) return Response.json({ error: "Session is required." }, { status: 400 });
  const { data, error } = await db.from("abbie_questions").select("*")
    .eq("session_id", sessionId).eq("status", "pending").order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ questions: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = text(body.id, 80);
  const action = text(body.action, 20);
  if (!id || (action !== "answer" && action !== "dismiss")) {
    return Response.json({ error: "Question and action are required." }, { status: 400 });
  }
  const patch = action === "answer"
    ? { status: "answered", answer: text(body.answer, 2000), answered_at: new Date().toISOString() }
    : { status: "dismissed" };
  const { error } = await db.from("abbie_questions").update(patch).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ updated: true });
}
