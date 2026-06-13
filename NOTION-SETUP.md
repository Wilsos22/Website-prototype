# Connecting the lesson page to Notion (one-time, ~10 min)

Your `/lesson` page reads today's lesson from your **Math 6 Lessons** Notion
database. To turn it on:

## 1. Make a Notion integration token
1. Go to **https://www.notion.so/my-integrations** → **New integration**.
2. Name it `Big Dog Math`, pick your workspace, submit.
3. Copy the **Internal Integration Secret** (starts with `secret_` / `ntn_`).
   Keep it private — don't paste it in chat.

## 2. Share the Lessons database with the integration
1. Open your **📘 Math 6 Lessons** database in Notion.
2. Top-right **•••** → **Connections** (or "Add connections") → choose **Big Dog Math**.
   (Without this, the integration can't read the database.)

## 3. Add the token to Vercel
1. Vercel → your project → **Settings → Environment Variables**.
2. Add **`NOTION_TOKEN`** = the secret from step 1. (No `NEXT_PUBLIC_` prefix — it stays server-side.)
3. Redeploy (or push) so it takes effect.

## 4. Add a few lesson columns (optional but recommended)
The page already uses **Essential Ideas, Assignment Link, Module #, Topic, Date,
Due Date**. To fill the rest of the agenda, add these columns to the Lessons DB
(any you skip just fall back to sensible defaults):

| Column name | Type | What it's for |
|---|---|---|
| `Agenda` | Text | Today's steps — **one per line** |
| `Supplies` | Text | Comma- or line-separated (Pencil, Notebook, Chromebook) |
| `Tools` | Text | Tool names, comma-separated (e.g. `Percent Bar, Number Line`) — they become buttons |
| `Warm Up Link` | URL | Link to today's warm-up form |
| `Exit Ticket Link` | URL | Link to the exit ticket |

Tool names that auto-link: Whiteboard, Number Line, Fraction Bars, Group Bars,
Percent Bar, Algebra Tiles, Equation Builder, GEMS, Combine Like Terms,
Proportions, Timer. (Other names show as plain labels.)

## 5. Publish today's lesson
The page shows the row whose **Date = today** and **Publish Workflow = Published**.
So for each class day, set that row's Date to the date and Publish Workflow to
**Published**.

That's it — once the token's in and a lesson is published for today, `/lesson`
(and the student journey's step 3) shows your real agenda.
