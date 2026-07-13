import { getSupabase } from "@/lib/supabase";

export const SECURE_STUDENT_DATA = process.env.NEXT_PUBLIC_SECURE_STUDENT_DATA === "true";

export class StudentApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

export async function ensureAnonymousStudentSession(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new StudentApiError("Student sign-in is not configured.", 503, "supabase_not_configured");
  }

  const current = await supabase.auth.getSession();
  if (current.data.session?.access_token) return current.data.session.access_token;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session?.access_token) {
    throw new StudentApiError(
      error?.message || "A secure student session could not be created.",
      503,
      "anonymous_session_failed",
    );
  }
  return data.session.access_token;
}

export async function getStudentAccessToken(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new StudentApiError("Student sign-in is not configured.", 503, "supabase_not_configured");
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new StudentApiError("Your student session expired. Rejoin the class.", 401, "student_session_missing");
  }
  return data.session.access_token;
}

export async function getStudentAuthUserId(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new StudentApiError("Student sign-in is not configured.", 503, "supabase_not_configured");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user.id) {
    throw new StudentApiError("Your student session expired. Rejoin the class.", 401, "student_session_missing");
  }
  return data.session.user.id;
}

export function personalizeWarmupLink(link: string, authUserId: string): string {
  return link
    .replaceAll("BDM_AUTH_USER_ID", encodeURIComponent(authUserId))
    .replaceAll(encodeURIComponent("BDM_AUTH_USER_ID"), encodeURIComponent(authUserId));
}

export async function studentApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getStudentAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string; code?: string };
  if (!response.ok) {
    throw new StudentApiError(
      result.error || "The student request could not be completed.",
      response.status,
      result.code || "student_api_error",
    );
  }
  return result;
}
