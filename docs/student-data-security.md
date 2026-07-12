# Student data security cutover

This document is the technical control record for moving Big Dog Math from its
permissive prototype posture to a least-privilege classroom system.

## Non-negotiable identity rule

The browser never supplies an authoritative student identity. Every student API
request sends a Supabase access token. The server validates the token, resolves
the linked roster record, and writes the server-derived `student_id` and display
name. A request body containing another student's ID is ignored or rejected.

Verified identity may come from either:

- a school Google account whose verified email matches exactly one roster row;
- the existing Google Form warm-up verification flow, which binds a Supabase
  anonymous browser user to the roster row matching the Form's verified email.

Anonymous browser users are not trusted merely because they possess a token.
They become usable only after the server has linked that token to a roster row.

## Authorization matrix

| Data | Student | Teacher | Anonymous public |
| --- | --- | --- | --- |
| Student profile | Own row only | Class roster through protected API | None |
| Session state | Joined session only | Full control through protected API | None |
| Poll prompt | Joined session, no answer key | Full control and aggregate results | None |
| Poll answer | Own answer only | Class results through protected API | None |
| Warm-up and tool evidence | Own records only | Class results through protected API | None |
| Checkpoint prompt | Joined class, no answer key | Full item and results | None |
| Checkpoint result | Own result only | Class results through protected API | None |
| Exit-ticket response | Own response only | Class results through protected API | None |
| Challenge or practice attempt | Own attempt only | Aggregate and class results | None |
| i-Ready, mastery, recommendations | No direct browser access | Protected server API only | None |
| Standards and public lesson reference data | Read-only | Read-only | Read-only when intentionally published |

## Cutover gates

Do not run `supabase/student-data-security.sql` until all of these are true:

1. Every student write uses an `/api/student/*` route that calls the verified
   identity guard.
2. Student session, poll, checkpoint, challenge, assignment, exit-ticket, and
   tool-evidence paths have no local-storage-only identity fallback.
3. Every teacher browser write uses a middleware-protected `/api/teacher/*`
   route with the service-role client.
4. Teacher pages no longer depend on permissive browser access for roster,
   submissions, session control, assignments, checkpoints, challenges, or exit
   tickets.
5. The migration passes a transaction-only RLS test as anonymous, Student A,
   Student B, and service role.
6. A 40-client classroom test passes login, join, live flow, polls, tool
   evidence, checkpoint, exit ticket, and teacher review.
7. A rollback SQL file and a current database backup are available.

## Required RLS assertions

- An unauthenticated request returns zero student, answer, score, and session
  rows and cannot insert, update, or delete any classroom record.
- Student A cannot read or mutate Student B's profile, joins, answers, attempts,
  or evidence.
- Student A cannot read poll or checkpoint answer-key columns.
- A student cannot join a different period, a closed session, or a session they
  have not been assigned to through the verified join endpoint.
- A teacher API request without the teacher cookie returns `401`.
- The service-role key never appears in browser code, client bundles, logs, or
  committed files.

## Operational controls

- Use fictional identities for all pre-production testing.
- Keep secrets only in Vercel environment variables and Apps Script properties.
- Record identity claims, joins, access denials, and account-link conflicts in
  `security_audit_events` without storing raw access tokens.
- Retain security events only as long as needed for troubleshooting and district
  review. Establish the final retention period with district policy.
- Review Supabase security advisors after every schema or policy change.
- Review Vercel runtime errors and authentication failures after each pilot.

## Protected teacher API foundation

The security branch provides cookie-gated, server-only routes for:

- roster and period management;
- sessions, class-state updates, joins, polls, and poll answers;
- challenges and leaderboards;
- practice assignments and results;
- checkpoint answer keys and results;
- exit tickets and responses;
- lesson presets.

The project runs Next.js 16, so the request gate must live at `src/proxy.ts`.
The deprecated root `middleware.ts` file did not execute in local authorization
tests. The proxy now fails closed when `TEACHER_PASSWORD` is absent, rejects
unauthenticated API requests, redirects teacher pages to login, and blocks
cross-site teacher mutations.

## District boundary

These controls make the application technically defensible, but they do not
replace CCSD vendor approval, privacy terms, data-processing requirements, or a
district decision about whether student email is directory information. The
production launch record should include the data inventory, this authorization
matrix, test results, retention policy, and the list of subprocessors: Vercel,
Supabase, Google, and Notion where applicable.
