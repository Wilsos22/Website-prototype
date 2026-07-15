import type { User } from "@supabase/supabase-js";
import { recordSecurityEvent } from "@/lib/securityAudit";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export type VerifiedStudent = {
  id: string;
  fullName: string;
  periodId: string;
  email: string;
  authUserId: string;
  identityMethod: "google" | "verified-warmup";
};

export type VerifiedStudentSession = {
  id: string;
  periodId: string;
  status: string;
};

export type AnonymousStudentAuth = {
  authUserId: string;
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
    public readonly code: string,
  ) {
    super(message);
  }
}

function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new StudentIdentityError(
      "Your Big Dog session is missing. Rejoin the class.",
      401,
      "missing_bearer_token",
    );
  }
  return match[1];
}

async function authenticatedUser(request: Request): Promise<User> {
  const token = bearerToken(request);
  const db = getSupabaseAdmin();
  if (!db) throw new StudentIdentityError("Student sign-in is not configured.", 503, "identity_not_configured");

  const { data: authData, error: authError } = await db.auth.getUser(token);
  if (authError || !authData.user) {
    throw new StudentIdentityError("Your sign-in expired. Sign in again.", 401, "invalid_access_token");
  }
  return authData.user;
}

function providersFor(user: User): string[] {
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers)) return providers.filter((value): value is string => typeof value === "string");
  return typeof user.app_metadata?.provider === "string" ? [user.app_metadata.provider] : [];
}

function verifiedGoogleEmail(user: User): string {
  const email = user.email?.trim().toLowerCase();
  if (!providersFor(user).includes("google") || !email || !user.email_confirmed_at) {
    throw new StudentIdentityError(
      "Use your verified school Google account.",
      403,
      "google_identity_required",
    );
  }
  return email;
}

async function linkedStudent(authUserId: string): Promise<StudentRow | null> {
  const db = getSupabaseAdmin();
  if (!db) throw new StudentIdentityError("Student sign-in is not configured.", 503, "identity_not_configured");

  const { data, error } = await db
    .from("students")
    .select("id,full_name,period_id,email,auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new StudentIdentityError("Student account lookup failed.", 500, "linked_lookup_failed");
  return data as StudentRow | null;
}

async function claimGoogleRosterRow(user: User): Promise<StudentRow> {
  const db = getSupabaseAdmin();
  if (!db) throw new StudentIdentityError("Student sign-in is not configured.", 503, "identity_not_configured");

  const email = verifiedGoogleEmail(user);
  const { data, error } = await db
    .from("students")
    .select("id,full_name,period_id,email,auth_user_id")
    .ilike("email", email)
    .maybeSingle();
  if (error) throw new StudentIdentityError("Student account lookup failed.", 500, "roster_lookup_failed");
  if (!data) throw new StudentIdentityError("This Google account is not on a class roster.", 403, "not_on_roster");

  const candidate = data as StudentRow;
  if (candidate.auth_user_id === user.id) return candidate;

  if (candidate.auth_user_id) {
    const { data: previous } = await db.auth.admin.getUserById(candidate.auth_user_id);
    if (!previous.user?.is_anonymous) {
      throw new StudentIdentityError(
        "This roster account is already linked to another sign-in.",
        409,
        "roster_already_claimed",
      );
    }
  }

  let claim = db
    .from("students")
    .update({ auth_user_id: user.id, auth_claimed_at: new Date().toISOString() })
    .eq("id", candidate.id);
  claim = candidate.auth_user_id
    ? claim.eq("auth_user_id", candidate.auth_user_id)
    : claim.is("auth_user_id", null);

  const { data: claimed, error: claimError } = await claim
    .select("id,full_name,period_id,email,auth_user_id")
    .maybeSingle();
  if (claimError) throw new StudentIdentityError("Student account linking failed.", 500, "claim_failed");
  if (!claimed) {
    throw new StudentIdentityError(
      "Student account linking changed. Sign in again.",
      409,
      "claim_conflict",
    );
  }
  void recordSecurityEvent({
    eventType: "google_identity_linked",
    outcome: "allowed",
    authUserId: user.id,
    studentId: (claimed as StudentRow).id,
  });
  return claimed as StudentRow;
}

export async function requireVerifiedStudent(request: Request): Promise<VerifiedStudent> {
  const user = await authenticatedUser(request);
  let student = await linkedStudent(user.id);
  let identityMethod: VerifiedStudent["identityMethod"];

  if (user.is_anonymous) {
    if (!student) {
      throw new StudentIdentityError(
        "Finish the Google warm-up so Big Dog can verify your school account.",
        428,
        "warmup_verification_required",
      );
    }
    identityMethod = "verified-warmup";
  } else {
    verifiedGoogleEmail(user);
    student = student ?? await claimGoogleRosterRow(user);
    identityMethod = "google";
  }

  if (!student.email) {
    throw new StudentIdentityError("Your roster record is missing a school email.", 409, "roster_email_missing");
  }

  return {
    id: student.id,
    fullName: student.full_name,
    periodId: student.period_id,
    email: student.email,
    authUserId: user.id,
    identityMethod,
  };
}

export async function requireAnonymousStudentAuth(request: Request): Promise<AnonymousStudentAuth> {
  const user = await authenticatedUser(request);
  if (!user.is_anonymous) {
    throw new StudentIdentityError(
      "Your verified account can join the class directly.",
      409,
      "verified_student_admission_not_needed",
    );
  }
  return { authUserId: user.id };
}

export async function requireOpenJoinedSession(
  student: VerifiedStudent,
  sessionId: string,
): Promise<VerifiedStudentSession> {
  if (!sessionId) {
    throw new StudentIdentityError("The class session is missing.", 400, "session_id_missing");
  }

  const db = getSupabaseAdmin();
  if (!db) throw new StudentIdentityError("Live sessions are not configured.", 503, "sessions_not_configured");

  const { data: session, error: sessionError } = await db
    .from("sessions")
    .select("id,period_id,status")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) throw new StudentIdentityError("The class session could not be checked.", 500, "session_lookup_failed");
  if (!session || session.status !== "open") {
    throw new StudentIdentityError("This class session is no longer open.", 404, "session_not_open");
  }
  if (session.period_id !== student.periodId) {
    throw new StudentIdentityError("This session belongs to a different class.", 403, "wrong_period");
  }

  const { count, error: joinError } = await db
    .from("session_joins")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .eq("student_id", student.id);
  if (joinError) throw new StudentIdentityError("Your class join could not be checked.", 500, "join_lookup_failed");
  if (!count) throw new StudentIdentityError("Join the class before continuing.", 403, "session_join_required");

  return { id: session.id, periodId: session.period_id, status: session.status };
}

export function studentIdentityResponse(error: unknown): Response {
  if (error instanceof StudentIdentityError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    { error: "Student sign-in failed.", code: "identity_unknown_error" },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}
