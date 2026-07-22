# Big Dog Math — Feature Roadmap

**The live tracker is in Notion:** "Big Dog Math — Feature Tracker"
(https://app.notion.com/p/f248b4164504427d896087e9b98aa2f4 · data source
`56ee55bb-c067-4613-8f3b-6d5810a82ced`). Steele checks things off there; agents
should update BOTH that database and this mirror when a feature ships.

Snapshot (2026-07-16):

## Live
Student home/join · Lesson page (Notion-fed) · Manipulative tools suite ·
Live polls (stuck-poll trap fixed) · Class mode broadcast · Challenge games ·
Today's boards · Control panel · Session controls · Rosters ·
**BRUH, the live team review game** (7/16 — ran in class and ran well. Replaces
the 46-slide Canva deck + buzzer receiver: the board itself shows who is in, who
is locked out and who is right. Teacher tool only; students arrive by broadcast.
`/teacher/bruh` setup with saved banks + 9 presets (270 questions, each
double-verified), `/teacher/bruh/board` projector, `/teacher/bruh/remote` iPad,
`/teacher/bruh/scoreboard` second screen, `/bruh` student. Server-authoritative
round clock and grading; units are required when the answer names one. Tables are
server-only. Deliberately does NOT feed the proficiency spine — it is about
teamwork and effort, not assessment) ·
**Anchor problems** (7/21 - each lesson can pose a real-world problem during
warm-up ("Puzzle of the day" on the main projector) that returns at closeout
with "You can answer it now." Notion fields Anchor Problem / Anchor Answer;
the answer stays teacher-only. L1 concert floor, L2-D1 water balloons,
L2-D2 skate park are live) ·
**Warm Notebook rollout complete** (7/21 - all four surfaces plus landing,
lessons archive, and Screen Studio wear the decided look; the teacher Remote
is dark per the 12d design; projectors have A-/A+ text scaling to 2.5x) ·
**Instant warm-up + student home base** (7/21 - permanent period class codes
(`periods.class_code`, DOG2-DOG5/DOG7/MOCK) open the day's warm-up the moment
a student types the code: `/api/student/warmup-start` reuses or auto-creates
the day's session seeded with today's published form, and the teacher's
/session inherits it. Once the form is open in its second tab - or the
response verifies - the landing becomes a home base: today's lesson card plus
Today's lesson / Challenge games / Explore the tools links that unlock when
the warm-up connects, keeping the origin tab's verification polling alive) ·
**Session page as in-class cockpit** (7/21 - Steele's ask, two rounds: /session
runs class start to finish without /control. The join-code card carries a
lesson transport - Start today's lesson (new server-side
/api/control-remote start-lesson action builds the flow from the published
Notion lesson and enters step 0 through the Remote's own navigateFlow), then
Back / Pause / Next state with the live state name, step count, and ticking
countdown; automatic pacing keeps advancing through the endpoint's lazy
transition while the page polls. The Classroom screens card shows LIVE scaled
iframe previews of Main, Pace + Support, and the Student view (follows the
class-mode broadcast), the iPad Remote stays as a link, the Challenge game
card collapses to a toggle when idle (expands automatically while one runs),
and the bottom "Ask a question" composer is gone - lesson steps carry the
questions now. The open-question card survives only as the off-switch for an
orphaned open poll. 7/22: ending got honest - End is a two-tap confirm (the
window.confirm dialog blocked the page ~3s and read badly on iPad), ending
one session immediately adopts and announces any OTHER open session instead
of letting it reappear silently on the next visit, and a banner with "End
all open sessions" shows whenever more than one is open - the "I ended it
but it's open again" report was two separate open sessions, not a failed
close) ·
**Transition buffer states with music** (7/21 - Steele's insight: the room
changing state is a real cost, so it gets its own planned minutes and its own
music. Three new first-class states - Transition - Hustle (coral, 1 min,
quick task switch), Transition - Reset (amber, 2 min, bigger room change),
Transition - Settle (teal, 1 min, bring the energy down) - drop into any
lesson as ordinary Notion steps (State ID transition-hustle / -reset /
-settle) or /builder lineups. Because control already plays music per state,
each vibe gains an upload slot automatically and the classroom laptop starts
and stops the track with the state: the song ending IS the deadline students
hear. The main projector renders a dedicated scene - vibe word, movement
directions, giant countdown, draining bar, "Up next" - and automatic pacing
sweeps into the next activity when the buffer ends, so transitions stop
eating the next state's clock. Preview: /teacher/present?preview=
transition-hustle) ·
**Long Division choreography rebuild** (7/21 - Steele's frame-by-frame spec
from the Vercel toolbar: the digits themselves now drag from the house to the
side equation one at a time (7 highlights, drags by the divide sign; the
divisor follows), the finished equation wave-highlights left to right before
the answer appears, and the answer drags back into the house - up into the
quotient on Divide, down under the digit on Multiply. Subtract draws its
minus sign and bar in the house stroke by stroke, wave-highlights the column
downward, and fades the difference in slowly; Bring down draws its arrow
before the digit lands. New Back button re-enters the previous step from its
first frame for rewatching, and Auto-lead now runs the full choreography on
EVERY problem - it only ran on problem 1, which is why it was hard to
follow) ·
**Projectors: staged hook + scene transitions** (7/21 - Steele's ask: the
warm-up anchor ("Puzzle of the day") now enters as a staged moment - kicker
settles, an accent rule draws itself beneath, the question rises in, then the
quiet direction line; after settling the rule breathes slowly so the screen
stays alive across warm-up. The closeout payoff reuses the same entrance.
The hook shows on BOTH panels: /teacher/pace mirrors the staging during
warm-up and stands its big clock card down - the small topbar timer pill
carries the time on each screen. Every lesson-state change on both panels now
enters as a scene - a calm rise-and-fade on the content plus a thin sweep of
the incoming state's accent drawing across the top, and the topbar chip and
dot crossfade their accent instead of snapping. All motion honors
prefers-reduced-motion) ·
**Warm Notebook screen kit** (7/20 — `public/screens/`: one hand-owned,
projector-ready HTML file per lesson state in the decided turn-12 Warm Notebook
look, scaled to any display by `_system/frame.js`; `_system/frame.css` is
generated from the Design canvas by `scripts/build-screen-kit.mjs` and the
screens themselves are never regenerated — Steele edits them directly.
`data-slot` marks text the site can fill from the Notion lesson step; deleting
the attribute locks hand-written content. Ships with a blank starter and a rich
exemplar; intended rendering layer under `/teacher/studio` and the four
surfaces) ·
**Weekly classroom display** (7/16 — separately launched projector display with
five weekday themes and four 20-second screens: Notion-fed learning intention,
success criteria, weekly topics with the current day highlighted, and the bell
schedule) ·
**Lesson Screen Studio** (7/15 — one private editing surface for every lesson
state with synchronized Main, Pace + Support, Student Chromebook, and iPad
Remote previews; guarded Notion saves with revision conflicts; no active-session
mutation) ·
**Notion roster sync** (needs `NOTION_ROSTER_DB_ID` + `CRON_SECRET` envs) ·
Teacher login (6-month device cookie; PIN gate removed) · Warm-up analytics ·
Checkpoint delivery · iPad ink → board · Abbie³ (voice + Stream Deck) ·
**Proficiency spine**: schema/seeds, EWMA engine (golden-tested 25/25),
mastery board + growth charts, /api/evidence, clustering + archetypes
(golden-tested 25/25), Right-now view w/ Notion Misconception Plans merge ·
**Checkpoint CSV upload** (/teacher/checkpoint-upload — tier + SBAC flags,
idempotent, auto-recompute) · **Tool evidence emitters** (EB/GEMS/CLT → mastery, session-gated) · Figma lesson-flow template ·
**Equation Builder redesign** (7/6 — auto-generated one-step equations incl.
÷ form, Albert Sans font one ink color, goal popup w/ sticky-red
wrong picks + Level Up! short answer, "Identify the variable" w/ named wrong
taps + persistent highlight, first-move question, inverse-drop animation, zero
pair "= 0" pop that vanishes, term auto-drops, student computes the other
side, inverse-ops key, level-switch fanfare, x on either side in Level Up!,
celebration + in-a-row counter; Regular/Level Up! naming here + GEMS) ·
**Growth view** (Right Now is now "Growth", linked from teacher nav + home;
/teacher/growth redirects) · **Claude-sharpened next moves** (7/6 —
/api/live/next-move + per-archetype "Sharpen this move" button on each Growth
cluster; archetype-aware, tool-grounded, reuses ANTHROPIC_API_KEY, template fallback) ·
**Abbie Console** (7/7 — summon Abbie³ from the control panel:
hold-to-talk mic (Web Speech STT + Stream Deck F8/?ptt=) for free-form live
conversation with running history, plus 6 quick-tap moods and a type/ask box;
context-aware (current state + lesson intention); teal projector bubble the
class sees + her real voice, voice/text-only toggle; /api/abbie takes a
`context` field; roast material loaded — Kendrick, tight pants, Legos, dog-park
small talk, etc.) ·
**Abbie on student screens** (7/7 — her line broadcasts to a dedicated
sessions.abbie column and pops a teal bubble on every joined student's screen,
any mode; global AbbieStudentBubble in the layout; needs abbie-broadcast.sql) ·
**Moderated Ask-Abbie queue** (7/7 — students type a question from an "Ask
Abbie" button; lands in the control-panel queue with a count badge; teacher
edits/approves and she answers the room, or dismisses; one pending per student;
abbie_questions table, needs abbie-questions.sql) ·
**Abbie contextual reactions** (7/7 — teacher-triggered: "Have Abbie react" on
poll results hands her the tally for a one-line take; "Have Abbie announce it"
on the spinner has her call the pick; shared abbieBus, no new setup) ·
**Abbie bits** (7/7 — Red Bull counter chip that roasts dad's hypocrisy on tap;
cross-day memory note in the console woven into her context; personality tuned
to complaining-teen, less Red Bull, shorter replies)

## In progress
- **iPad ink engine + the glass sheet** (7/21, commit c68da00) — Phase 1 of the
  "get the pen surface as close to Notability as the web allows" push. Strokes
  are now filled variable-width polygons: width flows continuously with
  EMA-smoothed Pencil pressure, both ends taper (mouse and finger get a light
  velocity synthesis). Three stacked canvases — translucent highlighter under,
  baked dry ink, and a per-frame wet layer carrying in-flight strokes, the
  Pencil's PREDICTED points (drawn, never stored or sent), and the eraser
  preview ring; only the wet layer uses a desynchronized context because the
  dry layers feed Export readback. Surface rect cached per stroke (no layout
  read per move event), zero-rects can never poison coordinates, and a surface
  opened in a background tab (projector behind /control) now sizes itself the
  moment it first lays out instead of staying 1x1 and silently painting
  nothing. New Highlight tool, Pencil-first palm rejection ("Finger draws"
  toggle; no first-touch window), and a screen wake lock. NEW "Write on
  screen" mode — the glass sheet: /teacher/present mounts a transparent
  pass-through ink overlay across the whole stage, and the iPad renders the
  same live view in an iframe under a transparent pen layer, letterboxed to
  the aspect ratio the projector announces, so strokes land on the wall
  exactly where the pen put them — over the lesson, poll results, any state.
  Board mode, scratch, templates, problems, and export unchanged. Verified
  end to end locally with synthetic Pencil pressure ramps across two tabs
  (taper geometry on the wire, display bake, palm rejection, highlighter
  layering, eraser, background-tab recovery, and an iPad-drawn circle landing
  exactly around the target on the present stage). Pencil-in-hand feel test
  is Steele's. PHASE 2 shipped same day (commit 1fbb770): synced UNDO/REDO
  with an operation history (undoing an eraser swipe restores everything it
  took; toolbar buttons with live enabled states on both surfaces plus
  scratch; two-finger tap undoes, three-finger tap redoes), the STROKE
  ERASER as the default Eraser (touch a stroke and the whole stroke
  vanishes, one history op per swipe; the classic rub-out lives on as the
  Pixel tool), HOLD-TO-STRAIGHTEN (hold the pen still ~600ms and the
  scribble snaps to a line - angle pulled onto 0/45/90, far end keeps
  following the pen - or a circle or rectangle; the wall swaps the raw
  scribble for the clean shape in one beat on pen-up), a LASER POINTER (a
  glowing fading trail every surface sees, never stored, never exported),
  and reconnect resync (a display that drops re-requests full board state,
  so a wifi blip cannot leave the wall missing strokes; also fixed a latent
  Phase 1 bug where switching surfaces could replay the last Clear).
  Verified with synthetic Pencil and touch events end to end; wire carries
  remove/restore/replace/laser. Phase 3 (pinch zoom + pages) queued.
- **Ladder Method — rule rail redesign + Factor Trees mode** (7/21, commit
  c9206cc) — /ladder-method now follows the three-column manipulative
  convention: the divisibility rules sit in the LARGE LEFT RAIL (same wording
  as /divisibility, rules 2-6 plus 7's honest non-rule), the ladder or trees
  in the center, results on the right. The rail is live guidance — a rule
  lights green when it works on BOTH bottom numbers (Ladder) or on the node
  being split (Trees), and tapping a lit rule loads that divisor. When the
  ladder closes, the pulled-out divisors line up UNDER it and the student
  multiplies them out one step at a time for the GCF, then extends the chain
  with the two bottom leftovers for the LCM; wrong products get the real
  arithmetic named. Factor Trees mode (rebuilt same day to Steele's spec,
  commit 4de7f5c): the rules own the left third and the tree owns the rest.
  No number options on screen — the teacher sets the sequence ahead of time
  (Factor Trees field on the /control ladder state, or ?set=24,36,60; shared
  parser src/lib/factorTreeSet.ts; /ladder-method gained a { set }
  LiveToolConfig arm) and students get one number at a time with progress
  dots and localStorage resume. The student types BOTH factors of a split; a
  wrong pair names its real product, pulses the lit rules, and points at one
  ("Not sure? Try 2 — the last digit is even"). New prime branches FLASH
  until tapped; the tap draws a circle and check mark that settles. When
  every prime is confirmed, the primes lift out of the tree and fly down to
  a line at the bottom (staggered, capped under 2s, hard fallback so a
  backgrounded tab can never strand a student; reduced motion lands them
  instantly), then the line collapses two at a time through an anchored
  pop-out — 2 x 2 becomes 4, 4 x 2 becomes 8 — until the original number
  stands alone, rebuilt from its primes. The earlier two-tree side-by-side
  compare was superseded by this spec and removed. No evidence emitters
  (unchanged). Verified end to end in-browser both modes; typecheck and
  build clean. Merged to main and live 7/21.
- **Divisibility D1 — rules 1-6, closes with clickable factor arches** (7/21,
  commit 8c7a79a, same branch as the Distributive Area work) — /divisibility now
  matches its D1 lesson scope. The rule rail is ÷1 through ÷6 only (7-10 removed
  outright); the numbers are 24, 35, 36, 40, 42, 48, chosen so every crossing
  point sits at or below 6 — the six rules always finish the factor list, and a
  factor of 7 arrives as a partner (35 = 5 x 7, 42 = 6 x 7) instead of needing a
  rule. The stop is still the computed crossing d*d > N (24 stops after testing
  4, 35 after 5), never "the board ran out". The least-to-greatest ordering step
  is replaced by pair-picking on the ascending factor line: the student clicks
  the TWO factors that multiply to N; a right pick draws a real curved SVG arch
  between them (endpoints pulse once, the product pops green at the apex,
  settles, fades), a wrong pick names the product they actually made ("Not this
  pair - 3 x 12 = 36, not 24"). 36 closes its square with a single 6 under a
  small 6 x 6 self-loop — no duplicated factor. Arches nest by span with the
  outermost tallest; the arch panel is full-width so 48's ten factors fit a
  Chromebook with no horizontal scroll. Completion line: "The arches are closed.
  Every factor has a partner, so the list is complete." prefers-reduced-motion
  shows the closed arches instantly. No evidence emitters (unchanged — this stays
  an optional-support tool). Verified in-browser across all six numbers plus the
  wrong Yes/No and wrong-pair paths; typecheck and build clean. Merged to main
  7/21.
- **Distributive Area Method — one-screen redesign + teacher problem series** (7/20)
  — the tool now works on a single screen: "Keep it whole" is gone (splitting is
  the point), and the equation chain sits directly under the area model, where
  students plug the parts into `a(__ + __) = a(__) + a(__)` and solve it one step
  at a time, each solved product dropping into its own region on the rectangle.
  Interactions cut from ~13 to 6 — one click to split, then five checks; no detour
  payoff screen, no product typed twice. Wrong answers get feedback aimed at the
  specific mistake (outside factor used as a part, added instead of multiplied,
  answered with the whole rectangle, product added to a part); two of those tag
  the existing "distributes to first term only" misconception. Area model ~3x
  bigger, sized off the measured container with a viewport-aware height budget, so
  the flow fits without scrolling on a laptop and an iPad. A teacher-set problem
  series can start three ways, all one format (`24x7, 16x8`, first number is the
  one they split): the Problem series field on the Distributive Area Method state
  in `/control` (rides the existing `live_flow` snapshot via a new `LiveToolConfig`
  variant — no new table or endpoint), a `?set=` link for a Notion step or handout,
  or the builder on the tool itself. Blank = students pick their own numbers, i.e.
  today's behaviour. Shared format/parser in `src/lib/distributiveProblems.ts`.
  Code done and typecheck/build clean; merged to main 7/21. Still owed: Steele's
  one-time spot-check of the control-panel publish with a student tab joined (that
  handoff could not be exercised locally — `/control` needs `TEACHER_PASSWORD`).
  Post-merge cleanup queued: swap the tool's local task banner for the shared
  `LiveToolBanner`, which main restyled for cream pages while this branch was in
  flight.
- **City Routes v1** (7/19) — the private differentiated release every M1.T1 lesson
  references. After the two-question readiness check, students split into three
  temporary support routes announced only as rotating park names (Yosemite,
  Acadia, ... — a deliberately connotation-free ten-name bank in
  `src/lib/cityRoutes.ts`), so no public screen ever shows a score, tier, or
  ability label. Pure engine (deterministic name+meaning rotation per lesson code
  + shuffle salt; 2/2 = independent, 1/2 = partner, 0/2 = teacher-guided;
  correct-but-low-Fist-to-Five flags a teacher check, never demotes; no answers =
  needs assignment). Server-only tables (`supabase/city-routes.sql`, mastery-style
  lockdown), teacher API `/api/live/city-routes` (gated), student card API
  `/api/student/city-route` (dual-mode like session-state: verified identity
  under the secure rollout, claimed id in transitional mode; returns
  city/destination/materials/first action only), review/override/shuffle/release
  panel on the iPad Remote, and the
  student card on `/live-flow` during small-group and independent states.
  Code + migration done; waiting on Steele to run `supabase/city-routes.sql`
  and a live run. Deferred: projector city-to-location key, timed stagger
  (encoded in first-action copy for now), per-lesson destination/materials
  editing, arrival receipts.
- **Grudge Ball** — second live team review game, forked from BRUH's engine (shares
  the question loop, grading, and `bruh_sets` banks; separate `grudge_*` tables so
  BRUH cannot regress). Same answer/reveal/explain, then the reward beat becomes
  shoot + steal: the teacher taps a correct team, they explain, shoot a real hoop
  for ~30s (a teammate taps MAKE per basket), then walk to the panel and knock X's
  off rivals by hand. Erase model (anti-snowball); zero X's = out of the shooting
  but still answering + immune; "back with a grudge" revives after 2 wilds-while-out
  wins, taking 3 from the nemesis. `/teacher/grudge` (+`/board`,`/scoreboard`,
  `/remote`), `/grudge` student. Code + migration done; waiting on Steele to run
  `supabase/grudge.sql` and a live run. Deliberately not on the proficiency spine.
- **Week builder** — code shipped (warmup-pools-data.gs + warmup-week-builder.gs +
  sidebar button); waiting on Steele's Apps Script paste-in. Builds the week from
  published Notion lessons: pool-backed Q4/Q5 (verified tags), AI openers only.
- Warm-up → spine bridge — live and verified (Evidence post 200, 7/4)

## Planned
- **Abbie everywhere** — DONE (Area=Abbie): console + mic, student-screen
  broadcast, Ask-Abbie queue, contextual reactions, and bits all shipped 7/7-8.
  Later, optional: server-side cross-day memory (auto-summarized) instead of the
  device-local note.
- Claude enrichment: score short-answer reasoning (next-move sharpening now Live)
- RLS tightening on legacy tables (required before real student data)
- Reskin remaining tools; vertical draggable control sequence
- Abbie lesson-sequence phases 2–5 (auto-built spinner/misconception/flashback/exit)

## Parked
Infinite Campus push · Scan/OCR checkpoint pipeline · Google student sign-in
(CCSD OAuth question first)

## Steele's open setup items
0. (done) supabase/bruh.sql has been applied - BRUH is live.
1. Reseed mock fixtures (`seed2_part_1…4`, `iready_seed2`) → verify colored bars.
2. Add `Misconception Plans` text property to the Lessons DB; author `tag :: move` lines.
3. Vercel envs: `NOTION_ROSTER_DB_ID`, `CRON_SECRET`, later `EVIDENCE_INGEST_KEY`;
   delete unused `NEXT_PUBLIC_TEACHER_PIN`.
4. Share the roster Notion DB with the integration.
5. Run `supabase/abbie-broadcast.sql` (done) and `supabase/abbie-questions.sql`
   once each so Abbie's student bubble and the Ask-Abbie queue work in class.
