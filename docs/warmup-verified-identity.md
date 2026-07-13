# Verified warm-up identity pilot

## What it uses

The Google warm-up already collects the respondent's verified school email.
Big Dog uses a Supabase anonymous browser session only as a device identifier.
The Form submission binds that browser identifier to the roster row matching the
verified email. It does not request Google Drive, Classroom, Gmail, or profile
permissions and does not require a Google Cloud OAuth project.

## Student flow

1. GoGuardian opens `https://bigdogmath.com/?code=CLASSCODE` for the class.
2. The student joins the class and starts the warm-up.
3. Big Dog replaces `BDM_AUTH_USER_ID` in the prefilled Form link with the
   current anonymous browser user ID.
4. Google Forms records the verified respondent email and the prefilled Big Dog
   session value.
5. The spreadsheet submit trigger posts both values to
   `/api/student/warmup-verify` using the existing evidence-ingest key.
6. Big Dog links that browser user to the matching roster record, confirms the
   live class session, and uses the verified identity for live poll answers.

## Activation checklist

Keep the feature off until every item is complete.

1. In Supabase Auth Providers, enable Anonymous Sign-Ins.
2. Confirm `EVIDENCE_INGEST_KEY` exists in Vercel.
3. In Apps Script Properties, set `BDM_EVIDENCE_KEY` to the same value. Do not
   paste the value into source code or chat.
4. Paste the reviewed warm-up script update into the active Apps Script project.
5. Run `installTimeTriggers()` once. Confirm there is exactly one spreadsheet
   submit trigger for `handleBigDogWarmupIdentitySubmit`.
6. Generate the M2.T1.L1 pilot warm-up. Confirm its Notion Form Link contains
   the placeholder `BDM_AUTH_USER_ID`.
7. Deploy the website code with
   `NEXT_PUBLIC_WARMUP_IDENTITY_ENABLED=true`.
8. Test with a fictional roster student before using a real student account.

## Current security boundary

This establishes a verified identity path inside the application, but it does
not by itself remove the older permissive Supabase policies. Keep the feature in
pilot status until remaining student and teacher browser queries have moved to
protected server routes and the permissive policies are replaced.
