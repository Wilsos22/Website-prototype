# Verified warm-up identity pilot

## Student flow

1. Big Dog creates an anonymous Supabase browser session.
2. The student enters the live class code and goes directly to the lesson. The
   roster-name picker is skipped.
3. Big Dog replaces `BDM_AUTH_USER_ID` in the prefilled Google Form link with
   the anonymous browser user ID.
4. Google Forms records the verified school email and the prefilled Big Dog
   session value.
5. The spreadsheet submit trigger posts both values to
   `/api/student/warmup-verify` using the shared evidence key.
6. Big Dog links that browser user to the roster record with the matching email,
   confirms the class session, and records later live answers under the verified
   student ID.

## Activation checklist

1. Enable Anonymous Sign-Ins in Supabase.
2. Apply `student-google-auth-foundation.sql` and
   `warmup-verified-identity.sql`.
3. Confirm `EVIDENCE_INGEST_KEY` exists in Vercel.
4. Set the Apps Script property `BDM_EVIDENCE_KEY` to the same value. Never put
   the value in source control.
5. Install `handleBigDogWarmupIdentitySubmit` with
   `installBigDogIdentityTrigger()`. This installer preserves unrelated project
   triggers.
6. Generate or retrofit a pilot warm-up. Confirm its exported Form link contains
   `BDM_AUTH_USER_ID`.
7. Set `NEXT_PUBLIC_WARMUP_IDENTITY_ENABLED=true` for Preview and Production.
8. Test the complete flow with a fictional roster student before using real
   student accounts.

## Current security boundary

This verifies the student identity used by class-session joins and live poll
answers. It does not remove older permissive Supabase policies. Keep this in
pilot status until those policies are replaced and remaining browser writes are
moved behind protected server routes.
