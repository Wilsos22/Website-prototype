// Device-remembering teacher session token. The cookie value is a SHA-256
// digest derived from TEACHER_PASSWORD — no session store needed, works in the
// edge middleware and node routes, and rotating the password invalidates every
// device at once.
const SALT = "bdm-teacher-cookie-v1";

export const TEACHER_COOKIE = "bdm_teacher";
export const TEACHER_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // ~6 months per device

export async function teacherToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${SALT}|${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
