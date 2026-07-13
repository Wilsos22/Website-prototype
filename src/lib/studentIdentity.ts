import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export type VerifiedStudent = {
  id: string;
  fullName: string;
  periodId: string;
  email: string;
};

type StudentRow = {
  id: string;
  full_name: string;
  period_id: string;
  email: string | null;
  auth_user_id: string | null;
};

export class StudentIdentityError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new StudentIdentityError("Your Big Dog session is missing. Rejoin the class.", 401);
  return match[1];
}

function verifiedGoogleEmail(user: User): string {
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers
    : [user.app_metadata?.provider].filter(Boolean);
  const email = user.email?.trim().toLowerCase();

  if (!providers.includes("google") || !email || !user.email_confirmed_at) {
    throw new StudentIdentityError("Use your verified school Google account.", 403);
  }
  return email;
}

export async function requireVerifiedStudent(request: Request): Promise<VerifiedStudent> {
  const db = getSupabaseAdmin();
  if (!db) throw new StudentIdentityError("Student sign-in is not configured on the server.", 503);

  const token = bearerToken(request);
  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData.user) {
    throw new StudentIdentityError("Your sign-in expired. Sign in again.", 401);
  }

  const user = authData.user;

  const { data: linked, error: linkedError } = await db
    .from("students")
    .select("id,full_name,period_id,email,auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (linkedError) throw new StudentIdentityError("Student account lookup failed.", 500);

  let student = linked as StudentRow | null;
  if (user.is_anonymous) {
    if (!student) {
      throw new StudentIdentityError("Finish the Google warm-up so Big Dog can verify your school account.", 428);
    }
  }

  if (!student) {
    const email = verifiedGoogleEmail(user);
    const { data: rosterMatch, error: rosterError } = await db
      .from("students")
      .select("id,full_name,period_id,email,auth_user_id")
      .ilike("email", email)
      .maybeSingle();
    if (rosterError) throw new StudentIdentityError("Student account lookup failed.", 500);
    if (!rosterMatch) {
      throw new StudentIdentityError("This Google account is not on a class roster.", 403);
    }

    const candidate = rosterMatch as StudentRow;
    if (candidate.auth_user_id && candidate.auth_user_id !== user.id) {
      throw new StudentIdentityError("This roster account is already linked to another sign-in.", 409);
    }

    if (!candidate.auth_user_id) {
      const { data: claimed, error: claimError } = await db
        .from("students")
        .update({ auth_user_id: user.id, auth_claimed_at: new Date().toISOString() })
        .eq("id", candidate.id)
        .is("auth_user_id", null)
        .select("id,full_name,period_id,email,auth_user_id")
        .maybeSingle();
      if (claimError) throw new StudentIdentityError("Student account linking failed.", 500);
      if (!claimed) throw new StudentIdentityError("Student account linking changed. Sign in again.", 409);
      student = claimed as StudentRow;
    } else {
      student = candidate;
    }
  }

  if (!student.email) throw new StudentIdentityError("Your roster record is missing a school email.", 409);
  return {
    id: student.id,
    fullName: student.full_name,
    periodId: student.period_id,
    email: student.email,
  };
}

export function studentIdentityResponse(error: unknown): Response {
  if (error instanceof StudentIdentityError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "Student sign-in failed." }, { status: 500 });
}
