import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BOARD_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Board storage is not configured." }, { status: 503 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const date = form?.get("date");
  if (!(file instanceof File) || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "A PNG board image and classroom date are required." }, { status: 400 });
  }
  if (file.type !== "image/png" || file.size < 1 || file.size > MAX_BOARD_BYTES) {
    return Response.json({ error: "Board images must be PNG files under 10 MB." }, { status: 400 });
  }
  const path = `${date}/${Date.now()}-${randomUUID()}.png`;
  const { error } = await db.storage.from("boards").upload(path, await file.arrayBuffer(), {
    contentType: "image/png",
    upsert: false,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ saved: true, path }, { status: 201 });
}
