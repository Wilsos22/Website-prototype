import { recordSecurityEvent } from "@/lib/securityAudit";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  requireAnonymousStudentAuth,
  StudentIdentityError,
  studentIdentityResponse,
} from "@/lib/studentIdentity";

export const dynamic = "force-dynamic";

const REQUEST_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newRequestCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => REQUEST_CODE_ALPHABET[byte % REQUEST_CODE_ALPHABET.length]).join("");
}

type PendingJoinRow = {
  id: string;
  request_code: string;
};

function isMissingAdmissionSchema(code?: string): boolean {
  return code === "42703" || code === "42883" || code === "PGRST202" || code === "PGRST204";
}

export async function POST(request: Request) {
  let authUserId: string | null = null;
  try {
    const identity = await requireAnonymousStudentAuth(request);
    authUserId = identity.authUserId;

    const body = await request.json().catch(() => ({})) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9]{2,8}$/.test(code)) {
      throw new StudentIdentityError("Enter the class code from your teacher.", 400, "invalid_join_code");
    }

    const db = getSupabaseAdmin();
    if (!db) throw new StudentIdentityError("Live sessions are not configured.", 503, "sessions_not_configured");

    const { data: session, error: sessionError } = await db
      .from("sessions")
      .select("id")
      .eq("join_code", code)
      .eq("status", "open")
      .maybeSingle();
    if (sessionError) {
      throw new StudentIdentityError("The class session could not be checked.", 500, "session_lookup_failed");
    }
    if (!session) throw new StudentIdentityError("That code is not open right now.", 404, "session_not_open");

    const existingResult = await db
      .from("session_joins")
      .select("id,request_code")
      .eq("session_id", session.id)
      .eq("auth_user_id", authUserId)
      .is("student_id", null)
      .maybeSingle();
    if (existingResult.error) {
      if (isMissingAdmissionSchema(existingResult.error.code)) {
        throw new StudentIdentityError(
          "Teacher admission is not configured yet.",
          503,
          "admission_schema_missing",
        );
      }
      throw new StudentIdentityError("The admission request could not be checked.", 500, "request_lookup_failed");
    }

    if (existingResult.data?.request_code) {
      await recordSecurityEvent({
        eventType: "student_admission_request",
        outcome: "allowed",
        authUserId,
        sessionId: session.id,
        details: { state: "existing" },
      });
      return Response.json(
        {
          request: {
            sessionId: session.id,
            requestCode: (existingResult.data as PendingJoinRow).request_code,
          },
        },
        { status: 202, headers: { "cache-control": "no-store" } },
      );
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const requestCode = newRequestCode();
      const insertResult = await db
        .from("session_joins")
        .insert({
          session_id: session.id,
          student_id: null,
          auth_user_id: authUserId,
          display_name: null,
          request_code: requestCode,
        })
        .select("id,request_code")
        .single();

      if (!insertResult.error && insertResult.data) {
        await recordSecurityEvent({
          eventType: "student_admission_request",
          outcome: "allowed",
          authUserId,
          sessionId: session.id,
          details: { state: "created" },
        });
        return Response.json(
          { request: { sessionId: session.id, requestCode } },
          { status: 202, headers: { "cache-control": "no-store" } },
        );
      }

      if (isMissingAdmissionSchema(insertResult.error?.code)) {
        throw new StudentIdentityError(
          "Teacher admission is not configured yet.",
          503,
          "admission_schema_missing",
        );
      }
      if (insertResult.error?.code !== "23505") {
        throw new StudentIdentityError("The admission request could not be saved.", 500, "request_save_failed");
      }

      const raceResult = await db
        .from("session_joins")
        .select("id,request_code")
        .eq("session_id", session.id)
        .eq("auth_user_id", authUserId)
        .is("student_id", null)
        .maybeSingle();
      if (raceResult.data?.request_code) {
        await recordSecurityEvent({
          eventType: "student_admission_request",
          outcome: "allowed",
          authUserId,
          sessionId: session.id,
          details: { state: "race_resolved" },
        });
        return Response.json(
          {
            request: {
              sessionId: session.id,
              requestCode: (raceResult.data as PendingJoinRow).request_code,
            },
          },
          { status: 202, headers: { "cache-control": "no-store" } },
        );
      }
    }

    throw new StudentIdentityError(
      "A request code could not be reserved. Try again.",
      409,
      "request_code_conflict",
    );
  } catch (error) {
    if (error instanceof StudentIdentityError) {
      await recordSecurityEvent({
        eventType: "student_admission_request",
        outcome: error.status === 409 ? "conflict" : "denied",
        authUserId,
        details: { reason: error.code },
      });
    } else {
      await recordSecurityEvent({
        eventType: "student_admission_request",
        outcome: "error",
        authUserId,
        details: { reason: "unknown_error" },
      });
    }
    return studentIdentityResponse(error);
  }
}
