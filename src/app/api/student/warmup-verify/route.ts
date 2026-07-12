import { getSupabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizedEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  const key = process.env.EVIDENCE_INGEST_KEY;
  if (!key || request.headers.get("x-bdm-key") !== key) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  if (!db) return Response.json({ error: "Database not configured." }, { status: 503 });

  const body = await request.json().catch(() => ({})) as { email?: unknown; authUserId?: unknown };
  const email = normalizedEmail(body.email);
  const authUserId = body.authUserId;
  if (!email || !validUuid(authUserId)) {
    return Response.json({ error: "A verified email and valid Big Dog session are required." }, { status: 400 });
  }

  const { data: authData, error: authError } = await db.auth.admin.getUserById(authUserId);
  if (authError || !authData.user || !authData.user.is_anonymous) {
    return Response.json({ error: "The Big Dog session is not a valid anonymous student session." }, { status: 403 });
  }

  const { data: existingLink, error: existingLinkError } = await db
    .from("students")
    .select("id,email")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (existingLinkError) return Response.json({ error: "Student identity lookup failed." }, { status: 500 });
  if (existingLink && normalizedEmail(existingLink.email) !== email) {
    return Response.json({ error: "This browser session is already linked to another roster account." }, { status: 409 });
  }

  const { data: rosterMatch, error: rosterError } = await db
    .from("students")
    .select("id,email,auth_user_id")
    .ilike("email", email)
    .maybeSingle();
  if (rosterError) return Response.json({ error: "Roster lookup failed." }, { status: 500 });
  if (!rosterMatch) return Response.json({ matched: false }, { status: 404 });

  if (rosterMatch.auth_user_id && rosterMatch.auth_user_id !== authUserId) {
    const { data: previousAuth } = await db.auth.admin.getUserById(rosterMatch.auth_user_id);
    if (previousAuth.user && !previousAuth.user.is_anonymous) {
      return Response.json({ error: "This roster account is protected by a permanent sign-in." }, { status: 409 });
    }
  }

  const { error: updateError } = await db
    .from("students")
    .update({ auth_user_id: authUserId, auth_claimed_at: new Date().toISOString() })
    .eq("id", rosterMatch.id);
  if (updateError) return Response.json({ error: "Roster identity linking failed." }, { status: 500 });

  return Response.json({ matched: true });
}
