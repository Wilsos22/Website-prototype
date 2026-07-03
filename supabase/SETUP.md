# Setting up your gradebook database (one-time, ~10 minutes)

This is the only part I can't do for you — creating accounts. Once it's done,
I take over and wire everything into the app.

## 1. Make a free Supabase project
1. Go to **https://supabase.com** and click **Start your project** → sign in with
   GitHub or email.
2. Click **New project**.
   - **Name:** `big-dog-math`
   - **Database password:** pick one and **save it somewhere** (you'll need it).
   - **Region:** choose the one closest to you.
3. Click **Create new project** and wait ~2 minutes for it to finish setting up.

## 2. Load the gradebook tables
1. In your new project, open **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file **`supabase/schema.sql`** (right next to this guide), copy all of
   it, paste it into the editor, and click **Run**.
4. You should see "Success. No rows returned." That means the tables were created.
   (You can check **Table Editor** — you'll see `periods`, `students`, `problems`,
   `assignments`, `responses`, and more.)

## 3. Grab the two connection values I'll need
In your project, go to **Project Settings** (gear icon) → **API**, and copy:
- **Project URL** (looks like `https://abcd1234.supabase.co`)
- **anon public** key (a long string under "Project API keys")

You'll also need the **service_role** key from that same page for the parts of the
app that write grades — keep that one private.

## 4. Hand them to me — safely
**Don't paste the keys into the chat.** Instead, add them to your project so the
app can read them:
1. In your **Vercel** dashboard, open the **website-prototype** project →
   **Settings** → **Environment Variables**.
2. Add three variables (I'll tell you the exact names when we wire it up):
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key
   - `SUPABASE_SERVICE_ROLE_KEY` = your service_role key
3. Tell me once they're added, and I'll connect the app to the database and start
   on your rosters + grading screens.

That's it. After this, everything else (rosters, capturing answers, the review
screen, period summaries, assignments) is on me.

## 5. Proficiency data spine (run when we wire the mastery system)
Same drill as step 2: SQL Editor → New query → paste **`supabase/proficiency.sql`**
→ Run. It adds the standards taxonomy + prerequisite graph, the misconception
vocabulary, EWMA mastery state/history, tunable weights, and next-move caching —
and locks the mastery tables to server-only access (the app reads them through
API routes using the service_role key, never from the browser).
