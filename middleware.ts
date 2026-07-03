import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = [
  "/teacher",
  "/control",
  "/session",
  "/roster",
  "/start-question",
  "/api/form-responses",
  "/api/mastery",
  "/api/live",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function unauthorized() {
  return new NextResponse("Teacher access required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Big Dog Math Teacher"',
    },
  });
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

export function middleware(request: NextRequest) {
  const password = process.env.TEACHER_PASSWORD;

  if (!password || !isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const username = process.env.TEACHER_USERNAME || "teacher";
  const auth = readBasicAuth(request.headers.get("authorization"));

  if (auth?.username === username && auth.password === password) {
    return NextResponse.next();
  }

  return unauthorized();
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
  ],
};
