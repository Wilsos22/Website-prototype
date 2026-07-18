// Teacher login: checks TEACHER_PASSWORD and sets the remember-this-device
// cookie (~6 months). The middleware accepts the cookie everywhere after this,
// so there's exactly one login per device — no browser popup, no PIN.
import { teacherToken, TEACHER_COOKIE, TEACHER_COOKIE_MAX_AGE } from "@/lib/teacherToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const password = process.env.TEACHER_PASSWORD;
  if (!password) return Response.json({ ok: true, note: "No TEACHER_PASSWORD set — teacher area is open." });

  let body: { password?: string };
  try { body = await req.json(); } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }
  if ((body.password || "") !== password) {
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }

  const token = await teacherToken(password);
  const res = Response.json({ ok: true });
  // Secure only in production: over plain http://localhost browsers refuse to
  // store a Secure cookie, which made local login "succeed" then bounce back.
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  res.headers.append(
    "Set-Cookie",
    `${TEACHER_COOKIE}=${token}; Path=/; Max-Age=${TEACHER_COOKIE_MAX_AGE}; HttpOnly;${secure} SameSite=Lax`,
  );
  return res;
}
