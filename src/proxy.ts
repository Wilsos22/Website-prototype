import { NextRequest, NextResponse } from "next/server";
import { teacherToken, TEACHER_COOKIE, TEACHER_COOKIE_MAX_AGE } from "@/lib/teacherToken";

const PROTECTED_PREFIXES = [
  "/teacher",
  "/control",
  "/session",
  "/roster",
  "/ipad",
  "/board",
  "/start-question",
  "/api/form-responses",
  "/api/mastery",
  "/api/live",
  "/api/roster",
  "/api/checkpoints",
  "/api/outreach",
  "/api/submissions",
  "/api/teacher",
  "/api/control-remote",
  "/api/iready",
  "/api/warmup-summaries",
];

const SECURE_ROLLOUT_PREFIXES = ["/api/session", "/api/warmup"];

function isProtectedPath(pathname: string) {
  if (PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  return process.env.NEXT_PUBLIC_SECURE_STUDENT_DATA === "true"
    && SECURE_ROLLOUT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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

export async function proxy(request: NextRequest) {
  const password = process.env.TEACHER_PASSWORD;
  const { pathname, search } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  if (!password) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Teacher access is not configured." }, { status: 503 });
    }
    const login = new URL("/teacher-login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    login.searchParams.set("error", "configuration");
    return NextResponse.redirect(login);
  }

  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== request.nextUrl.host) {
          return NextResponse.json({ error: "Cross-site teacher request blocked." }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
      }
    }
  }

  const expected = await teacherToken(password);
  if (request.cookies.get(TEACHER_COOKIE)?.value === expected) {
    return NextResponse.next();
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return NextResponse.next();
  }

  const auth = readBasicAuth(request.headers.get("authorization"));
  if (auth && auth.password === password && auth.username === (process.env.TEACHER_USERNAME || "teacher")) {
    const response = NextResponse.next();
    response.cookies.set(TEACHER_COOKIE, expected, {
      path: "/",
      maxAge: TEACHER_COOKIE_MAX_AGE,
      httpOnly: true,
      // Secure only in production — http://localhost drops Secure cookies.
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    return response;
  }

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
    "/ipad/:path*",
    "/board/:path*",
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
    "/api/teacher/:path*",
    "/api/teacher",
    "/api/control-remote/:path*",
    "/api/control-remote",
    "/api/iready/:path*",
    "/api/iready",
    "/api/warmup-summaries/:path*",
    "/api/warmup-summaries",
    "/api/session/:path*",
    "/api/session",
    "/api/warmup/:path*",
    "/api/warmup",
  ],
};
