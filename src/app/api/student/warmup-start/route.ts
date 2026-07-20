import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireStudentAuth,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";
import type { LiveClassFlowSnapshot } from "@/lib/liveClassFlow";
import { assignedWarmupLink, canonicalGoogleFormResource } from "@/lib/warmupResource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function classCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9]{2,8}$/.test(code)) {
    throw new StudentIdentityError("Enter the class code from your teacher.", 400, "invalid_join_code");
  }
  return code;
}

export async function POST(request: Request) {
  try {
    const identity = await requireStudentAuth(request);
    const body = await request.json().catch(() => ({})) as { code?: unknown };
    const code = classCode(body.code);

    const db = getSupabaseAdmin();
    if (!db) {
      throw new StudentIdentityError("Live sessions are not configured.", 503, "sessions_not_configured");
    }

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id,live_flow")
      .eq("join_code", code)
      .eq("status", "open")
      .maybeSingle();
    if (sessionError) {
      throw new StudentIdentityError("The class session could not be checked.", 500, "session_lookup_failed");
    }
    if (!session) {
      throw new StudentIdentityError("That code is not open right now.", 404, "session_not_open");
    }

    const liveFlow = session.live_flow as LiveClassFlowSnapshot | null;
    const warmupUrl = assignedWarmupLink(liveFlow);
    const resourceKey = canonicalGoogleFormResource(warmupUrl);
    if (warmupUrl && !resourceKey) {
      throw new StudentIdentityError(
        "Today's warm-up needs to be reconnected by your teacher.",
        409,
        "warmup_form_not_connected",
      );
    }

    const { error: receiptError } = await db
      .from("student_warmup_sessions")
      .upsert(
        {
          auth_user_id: identity.authUserId,
          session_id: session.id,
          warmup_resource_key: resourceKey || null,
        },
        {
          onConflict: "auth_user_id,session_id",
          ignoreDuplicates: true,
        },
      );
    if (receiptError) {
      throw new StudentIdentityError("The warm-up could not be opened.", 500, "receipt_save_failed");
    }

    let { data: receipt, error: receiptLookupError } = await db
      .from("student_warmup_sessions")
      .select("verification_token,warmup_resource_key,completed_at")
      .eq("auth_user_id", identity.authUserId)
      .eq("session_id", session.id)
      .maybeSingle();
    if (receiptLookupError || !receipt?.verification_token) {
      throw new StudentIdentityError("The warm-up connection could not be loaded.", 500, "receipt_lookup_failed");
    }


    // Replacing the assigned Form invalidates the earlier open Form. Rotate the
    // one-time token and clear completion so only the newly assigned resource
    // can unlock this session.
    const nextResourceKey = resourceKey || null;
    if (receipt.warmup_resource_key !== nextResourceKey) {
      const previousToken = receipt.verification_token;
      const refreshResult = await db
        .from("student_warmup_sessions")
        .update({
          verification_token: crypto.randomUUID(),
          warmup_resource_key: nextResourceKey,
          started_at: new Date().toISOString(),
          completed_at: null,
        })
        .eq("auth_user_id", identity.authUserId)
        .eq("session_id", session.id)
        .eq("verification_token", previousToken)
        .select("verification_token,warmup_resource_key,completed_at")
        .maybeSingle();
      if (refreshResult.error) {
        throw new StudentIdentityError("The warm-up connection could not be refreshed.", 500, "receipt_refresh_failed");
      }
      if (refreshResult.data) {
        receipt = refreshResult.data;
      } else {
        const currentResult = await db
          .from("student_warmup_sessions")
          .select("verification_token,warmup_resource_key,completed_at")
          .eq("auth_user_id", identity.authUserId)
          .eq("session_id", session.id)
          .maybeSingle();
        if (currentResult.error || !currentResult.data) {
          throw new StudentIdentityError("The warm-up connection could not be confirmed.", 500, "receipt_refresh_failed");
        }
        receipt = currentResult.data;
      }
    }

    return Response.json(
      {
        sessionId: session.id,
        warmupToken: receipt.verification_token,
        warmUpLink: warmupUrl || null,
        lesson: liveFlow?.lesson
          ? {
              code: liveFlow.lesson.code || "",
              title: liveFlow.lesson.title || "",
            }
          : null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return studentIdentityResponse(error);
  }
}
