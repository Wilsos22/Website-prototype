export class TeacherApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export function isTeacherSurface(): boolean {
  if (typeof window === "undefined") return false;
  return ["/teacher", "/control", "/session", "/roster", "/ipad", "/board"]
    .some((prefix) => window.location.pathname === prefix || window.location.pathname.startsWith(`${prefix}/`));
}

export async function teacherApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new TeacherApiError(result.error || "The teacher request could not be completed.", response.status);
  }
  return result;
}

export function teacherPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return teacherApiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
}
