import { NextRequest, NextResponse } from "next/server";
import { teacherToken, TEACHER_COOKIE, TEACHER_COOKIE_MAX_AGE } from "@/lib/teacherToken";

const PROTECTED_PREFIXES = [
  "/teacher",
  "/control",
  "/session",
  "/roster",
  "/start-question",
  "/api/form-responses",
  "/api/mastery",
  "/api/live",
  "/api/roster",
  "/api/checkpoints",
  "/api/outreach",
  "/api/submissions",
  "/api/control-remote",
  "/api/teacher",
  "/ipad",
  "/board",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function readBasicAuth(header: string | null) {
  if (!header?.startsWith("Basic ")) return null;

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator === -1) return null;

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const password = process.env.TEACHER_PASSWORD;
  const { pathname, search } = request.nextUrl;

  if (!password || !isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // 1. Device cookie (set once by /teacher-login, lasts ~6 months).
  const expected = await teacherToken(password);
  if (request.cookies.get(TEACHER_COOKIE)?.value === expected) {
    return NextResponse.next();
  }

  // 2. Vercel cron authenticates with CRON_SECRET.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return NextResponse.next();
  }

  // 3. Proactive basic auth (curl/scripts) still works — and upgrades to the cookie.
  const auth = readBasicAuth(request.headers.get("authorization"));
  if (auth && auth.password === password && auth.username === (process.env.TEACHER_USERNAME || "teacher")) {
    const res = NextResponse.next();
    res.cookies.set(TEACHER_COOKIE, expected, {
      path: "/", maxAge: TEACHER_COOKIE_MAX_AGE, httpOnly: true, secure: true, sameSite: "lax",
    });
    return res;
  }

  // 4. Unauthenticated: APIs get a JSON 401 (no browser popup); pages go to the login screen.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Teacher login required." }, { status: 401 });
  }
  const login = new URL("/teacher-login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/teacher/:path*",
    "/control/:path*",
    "/session/:path*",
    "/roster/:path*",
    "/start-question/:path*",
    "/api/form-responses/:path*",
    "/api/mastery/:path*",
    "/api/mastery",
    "/api/live/:path*",
    "/api/roster/:path*",
    "/api/checkpoints/:path*",
    "/api/outreach/:path*",
    "/api/outreach",
    "/api/submissions/:path*",
    "/api/submissions",
    "/api/control-remote/:path*",
    "/api/control-remote",
    "/api/teacher/:path*",
    "/ipad/:path*",
    "/ipad",
    "/board/:path*",
    "/board",
  ],
};
