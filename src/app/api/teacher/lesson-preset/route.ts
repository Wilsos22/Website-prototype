import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const search = (url.searchParams.get("search") || "").trim();
  let query = db.from("lesson_presets").select("id,code,title,sequence,updated_at").order("code");
  if (id) query = query.eq("id", id);
  if (search) query = query.or(`code.ilike.%${search.replace(/[%_,()]/g, "")}%,title.ilike.%${search.replace(/[%_,()]/g, "")}%`);
  const { data, error } = await query.limit(id ? 1 : 100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(id ? { preset: data?.[0] ?? null } : { presets: data ?? [] }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action, 20);

  if (action === "save") {
    const id = text(body.id, 80);
    const code = text(body.code, 120);
    const title = text(body.title, 200);
    const sequence = body.sequence && typeof body.sequence === "object" ? body.sequence : null;
    if (!code || !title || !sequence) return Response.json({ error: "Code, title, and sequence are required." }, { status: 400 });
    const payload = { code, title, sequence, updated_at: new Date().toISOString() };
    const query = id
      ? db.from("lesson_presets").update(payload).eq("id", id).select("id").maybeSingle()
      : db.from("lesson_presets").insert(payload).select("id").maybeSingle();
    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ saved: true, id: data?.id });
  }

  if (action === "delete") {
    const id = text(body.id, 80);
    if (!id || body.confirm !== true) return Response.json({ error: "Deleting a preset requires explicit confirmation." }, { status: 400 });
    const { error } = await db.from("lesson_presets").delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ deleted: true });
  }

  return Response.json({ error: "Unknown preset action." }, { status: 400 });
}
