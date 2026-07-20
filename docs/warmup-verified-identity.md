# Verified warm-up identity pilot

## Approved student flow

1. The student opens Big Dog Math and enters the teacher's class code.
2. Big Dog confirms that the code belongs to an open class session and reads the warm-up from the lesson the teacher selected. The pacing timer does not need to be running.
3. The page changes to `Code accepted` and offers today's assigned Google Form warm-up.
4. Big Dog creates one server-only receipt for that Chromebook and class session, then replaces the legacy `BDM_AUTH_USER_ID` placeholder in the prefilled Form URL with the receipt's opaque verification token.
5. The student opens and submits the Google Form with the school Google account already used by the existing warm-up workflow.
6. The spreadsheet submit trigger reads the verified respondent email directly from the Google Form response and sends it with the prefilled session token and submitted Form URL to `/api/student/warmup-verify`. An editable email question is never accepted for identity.
7. Big Dog verifies that the one-time token belongs to an open session, that the submitted Form is the exact Form currently assigned to that session, and that the normalized email appears exactly once in that period's roster. It then records completion and links the Chromebook identity in one database transaction.
8. The original Big Dog tab checks every three seconds, unlocks the solo challenge activities only after this session's receipt is complete, and stays open as the student homepage.
9. When the teacher advances beyond Warm-Up, Big Dog synchronizes the verified Chromebook into the live lesson automatically.

The class code comes first. A student is not asked to complete an unrelated form before Big Dog knows which class session the student is joining. A prior day's identity link does not count as today's completion. The normal path does not create a teacher approval request; a student may explicitly ask for help only if the Form bridge does not connect. The join code is not shown again after it is accepted.

## What this keeps

- Google Forms remains the warm-up authoring and response system.
- Google Sheets remains the submission trigger and backup export path.
- Notion remains the lesson and warm-up record system.
- Big Dog displays or opens the assigned Form, unlocks solo challenge activities after verification, and handles the later transition into the live lesson.
- No native Big Dog warm-up form is added.

Google Forms does not provide a supported hidden question. The required `Big Dog connection` item is therefore visible at the bottom of the Form, but its value is prefilled automatically. Its help text tells students not to change it. Each token can be used only once. If the teacher replaces the assigned Form, Big Dog rotates the token, relocks the warm-up receipt, and rejects the already-open old Form.

## One-time activation

Keep the pilot off until every item below is complete, in this order.

1. In Supabase Auth Providers, enable Anonymous Sign-Ins.
2. Confirm that the earlier `student-admission-override.sql` migration is present, including `public.bdm_admit_student_join_request`. Then apply `supabase/student-warmup-sessions.sql` to the live Website-Prototype Supabase project. Confirm that `public.student_warmup_sessions` has RLS enabled and that `public.bdm_admit_student_join_request_with_warmup` exists before deploying the matching website code.
3. Confirm that Vercel has `EVIDENCE_INGEST_KEY`.
4. In Apps Script Project Settings, set the Script Property `BDM_EVIDENCE_KEY` to the same value. Never paste the value into source code, documentation, or chat.
5. Paste the current repo versions of these files into the active warm-up Apps Script project:
   - `warmup-engine.gs`
   - `warmup-generator.gs`
   - `warmup-week-builder.gs`
   - `warmup-notion-sync.gs`
   - `notion-warmup-requests.gs`
   - `warmup-evidence.gs`
   - `warmup-ai-generator.gs`
   - `warmup-pools-data.gs`
   - `warmup-sidebar-functions.gs`
6. Run `repairAllWarmupTriggers()` once. Then run `listTriggers()` and confirm that exactly one form-submit trigger remains: the spreadsheet-level `syncSubmissionToExportSheet` trigger.
7. Set `NEXT_PUBLIC_SECURE_STUDENT_DATA=true` and `NEXT_PUBLIC_WARMUP_IDENTITY_ENABLED=true` in the applicable Vercel environment only when the Apps Script bridge and database receipt table are ready together.
8. Deploy the matching website commit.

`BDM_IDENTITY_URL` is optional. When omitted, the script posts to `https://bigdogmath.com/api/student/warmup-verify`.

## Connect an already-published warm-up

Publishing the ordinary Google Form URL is not enough for the identity pilot because it does not contain the Chromebook placeholder.

1. In the active Apps Script project, run `upgradePublishedWarmupForBigDog()`.
2. When prompted, paste the Google Form ID from the Form's edit URL.
3. Confirm in Form settings that email collection is on. The upgrade also enables it programmatically.
4. Copy the returned prefilled URL from the execution log.
5. Paste that full URL into the matching Notion lesson's `Warm up link` field.
6. Confirm that the saved link contains `BDM_AUTH_USER_ID`.

New Forms created by the updated generator receive the `Big Dog connection` item and prefilled URL automatically. Their exported and Notion-linked URL should already contain `BDM_AUTH_USER_ID`.

## Pilot verification

Use a fully fictional roster student before any classroom use.

1. Start one new session and select the intended lesson. Leave lesson pacing paused for this first check.
2. On a clean student browser, enter the join code.
3. Confirm that the page says `Code accepted` and the warm-up is available before `Begin lesson` or the pacing timer is started.
4. Confirm that the Form's `Big Dog connection` field is prefilled with an opaque UUID token and is not `BDM_AUTH_USER_ID`. It must not be the Chromebook's persistent auth user ID.
5. Submit the Form while signed into the fictional school Google account. Confirm Google Forms labels the collected email as verified, not as a question students can edit.
6. Keep the Big Dog tab open and confirm that `Challenge activities` appears without teacher approval or re-entering the code.
7. Open a solo practice game, advance the teacher flow beyond Warm-Up, and confirm that the Chromebook enters the live lesson.
8. Confirm that only one warm-up submission and one aggregate evidence event were recorded.
9. Refresh the student page and confirm that the linked browser returns to the same verified student homepage.

## Troubleshooting a student stuck after submission

Check these in order:

1. The Notion `Warm up link` contains `BDM_AUTH_USER_ID` before the student opens it.
2. The Form response includes a valid UUID in `Big Dog connection`.
3. `response.getRespondentEmail()` returned the intended school Google email. An answer typed into an `Email` question does not count.
4. The Form URL in the Apps Script post matches the Form currently assigned to the session.
5. That exact normalized email exists once in the Supabase student roster for the session's class period.
6. Apps Script has exactly one `syncSubmissionToExportSheet` submit trigger.
7. `BDM_EVIDENCE_KEY` and Vercel `EVIDENCE_INGEST_KEY` match.
8. The Apps Script execution log shows a 2xx `Warm-up identity post` response.
9. The class session is still open.
10. The live Supabase receipt row for that session has the same verification token, the assigned Form resource key, and a non-null `completed_at` value.

If those checks pass but the student is still waiting, the student can choose `Warm-up not connecting? Ask for help`. The teacher matches the displayed help code to the roster student once. That explicit recovery atomically links the Chromebook, completes the current receipt, and lets the normal homepage poll continue. It is not part of the whole-class arrival routine.

## Current security boundary

This establishes a verified identity path inside the application, but it does not by itself remove older permissive Supabase policies. Keep the feature in pilot status until the remaining student and teacher browser queries have moved to protected server routes and those policies have been replaced.
