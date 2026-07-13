import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{2,8}$/.test(code)) {
    return Response.json({ open: false }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Live sessions are not configured." }, { status: 503 });
  const { count, error } = await db.from("sessions").select("id", { count: "exact", head: true })
    .eq("join_code", code).eq("status", "open");
  if (error) return Response.json({ error: "The class code could not be checked." }, { status: 500 });
  return Response.json({ open: Boolean(count) }, { headers: { "cache-control": "no-store" } });
}
