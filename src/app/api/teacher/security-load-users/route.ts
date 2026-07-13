import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "preview" || process.env.NEXT_PUBLIC_SECURE_STUDENT_DATA !== "true") {
    return Response.json({ error: "Not available." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as { marker?: unknown; count?: unknown };
  const marker = typeof body.marker === "string" ? body.marker.trim() : "";
  const count = Number.isInteger(body.count) ? Number(body.count) : 0;
  if (!/^bdm_load_[a-z0-9_]{8,80}$/i.test(marker) || count < 1 || count > 40) {
    return Response.json({ error: "A valid load-test marker and client count are required." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ error: "Student authentication is not configured." }, { status: 503 });

  const users: Array<{ index: number; authUserId: string; accessToken: string }> = [];
  for (let start = 0; start < count; start += 5) {
    const batch = Array.from({ length: Math.min(5, count - start) }, (_, offset) => start + offset);
    const created = await Promise.all(batch.map(async (index) => {
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await supabase.auth.signInAnonymously({
        options: { data: { bdm_test_marker: marker, bdm_test_index: index } },
      });
      if (error || !data.user || !data.session?.access_token) {
        throw new Error(error?.message || `Anonymous load-test sign-in ${index} failed.`);
      }
      return { index, authUserId: data.user.id, accessToken: data.session.access_token };
    }));
    users.push(...created);
  }

  return Response.json(
    { marker, users },
    { headers: { "cache-control": "no-store, private" } },
  );
}
