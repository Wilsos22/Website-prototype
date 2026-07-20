import type { LiveClassFlowSnapshot } from "@/lib/liveClassFlow";

const GOOGLE_FORMS_HOST = "docs.google.com";

export function canonicalGoogleFormResource(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== GOOGLE_FORMS_HOST) return "";
    const match = url.pathname.match(/^(\/forms\/d\/(?:e\/)?[^/]+)\/(?:viewform|formResponse)\/?$/i);
    return match ? `https://${GOOGLE_FORMS_HOST}${match[1]}/viewform` : "";
  } catch {
    return "";
  }
}

export function assignedWarmupLink(flow: LiveClassFlowSnapshot | null): string {
  const current = flow?.state?.id === "warmup" ? flow.resource?.url || "" : "";
  return current
    || (flow?.sequence?.steps ?? []).find((step) => step.stateId === "warmup")?.resourceUrl
    || "";
}

export function currentWarmupResourceKey(flow: LiveClassFlowSnapshot | null): string {
  return canonicalGoogleFormResource(assignedWarmupLink(flow));
}
