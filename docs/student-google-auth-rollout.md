# Student Google Auth rollout

## Verified current state on 2026-07-11

- Supabase Google provider: disabled
- Supabase Auth users: 0
- Roster rows with email: 25 of 25
- Duplicate normalized roster emails: 0
- Student identity columns and indexes: applied additively
- Required-login application flag: off unless explicitly set in Vercel
- Existing prototype RLS: still permissive and not safe for real student data

## Why the RLS cutover is separate

Student pages and teacher pages currently use the same browser Supabase client.
Google Auth can identify a student, but the teacher browser is authenticated by
the Big Dog teacher cookie rather than a Supabase user. Replacing every permissive
policy immediately would therefore block the teacher control panel, roster,
session, assignment, checkpoint, and reporting pages.

Before changing the live policies, move teacher reads and writes behind protected
server API routes using `getSupabaseAdmin()`. Then apply ownership policies that:

- let an authenticated student select only the roster row whose
  `students.auth_user_id` equals `auth.uid()`;
- let a student read only an open session for the student's own period after the
  student has joined it;
- let a student create and read only the student's own join, poll answer, exit
  ticket response, checkpoint result, assignment attempt, challenge attempt, and
  evidence rows;
- keep lesson prompts, public tool configuration, and standards read-only;
- revoke all anonymous writes and all browser access to teacher-only records.

Do not use a policy whose only condition is `TO authenticated`. Every student row
policy must include an ownership predicate tied through `students.auth_user_id`.

## Pilot activation order

1. Create the Google OAuth client using only basic identity scopes.
2. Enable Google in Supabase and add the production callback URL.
3. Run the app locally with the required-login flag on.
4. Verify teacher Google sign-in and one fictional roster identity.
5. Try one CCSD student account. Record whether CCSD allows it or presents an
   administrator-review message.
6. Refactor teacher Supabase browser access to protected server routes.
7. Apply and test ownership-based RLS with fictional identities.
8. Turn on the Vercel required-login flag, deploy, and run the full M2.T1.L1 pilot.
