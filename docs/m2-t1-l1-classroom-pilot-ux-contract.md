# M2.T1.L1 Classroom Pilot UX Contract

Status: Frozen for the first front-to-back classroom pilot
Pilot lesson: Math 6 M2.T1.L1, Day 1
Date frozen: July 14, 2026

## Purpose

This contract defines one complete 55-minute M2.T1.L1 classroom pilot across two projectors, one student Chromebook experience, and one private teacher iPad Remote. It resolves differences between the approved UX checkpoint, the current live Notion lesson, the current Supabase state, and the current application code.

The approved UX checkpoint is controlling when an older implementation or lesson record conflicts with this contract. Live systems must be migrated deliberately; this document does not authorize silent data rewrites.

## Source hierarchy

1. This frozen pilot contract and its approved UX checkpoint.
2. The Claude Design wireframe, using composition 3a as the layout reference.
3. The live Math 6 Lessons and Lesson Steps data sources in Notion.
4. The live Supabase project and its current row-level security policies.
5. The application on the current shared repository branch.

Composition 3a means a large primary work region, a compact floating lesson-state and timer pill, and persistent success criteria. The wireframe's light palette is not the projector color reference. Projector surfaces use the semantic dark palettes defined below.

## Four synchronized roles

### 1. Main interactive projector

Route: `/teacher/present`

Purpose: show the mathematical story, model, prompt, or interactive work area that owns student attention.

Required behavior:

- Use a rich dark background with a soft tonal glow.
- Give the active mathematical content the largest visual area.
- Keep the current phase, time remaining, and lesson code in a compact floating pill.
- Keep the success criteria visible without covering the work area.
- Show teacher-selected reveals, representations, tools, and discussion prompts.
- Never show student names, individual responses, answer keys before the teacher reveals them, or private teacher notes.

### 2. Pace + Support projector

Route: `/teacher/pace`

Purpose: keep the room oriented while the main projector carries the mathematical content.

Required behavior:

- Show the current phase and current directions in the largest type.
- Show the timer and an explicit `Time is up` state at zero.
- Show what is next in a smaller, clearly labeled region.
- Show approved support such as the learning intention, success criteria, vocabulary, sentence stems, or help path.
- Never show student names, individual responses, private teacher notes, answer keys, or teacher controls.

### 3. Student Chromebook

Route: `/live-flow`

Purpose: give each student exactly one current digital action.

Required behavior:

- Use a warm cream ground with the current phase's semantic accent color.
- Show only the current action, its directions, and its explicit status.
- Open or display the verified Google Form for the warm-up; do not create a native warm-up form.
- During paper-first work, show directions, every required paper problem number, due and turn-in information, the help path, and an optional assigned manipulative. Do not reproduce paper problem content.
- Preserve an unfinished student draft when the teacher changes phase, closes a poll, or advances the lesson.
- Make editing, saving, saved, failed, reconnecting, and submitted states explicit.

### 4. Private teacher iPad Remote

Route: `/teacher/remote`

Purpose: control the active class session and see private instructional data without putting it on either projector.

Required behavior:

- Identify the targeted class session with lesson code, join code, and start time before commands can be sent.
- Show the current phase, time, current directions, and what is next.
- Provide previous, next, pause, resume, add time, reset, and approved audio controls.
- Default auto-advance to off and never switch it on implicitly.
- Show aggregate response data and, when needed, private student-level response data.
- Show command sending, received, failed, and disconnected states.

The `/control` route remains a dark operator and setup surface. It is not one of the four student-visible pilot roles and must not be projected during normal instruction.

## Exact 55-minute lesson flow

| Order | Phase | Minutes | Semantic palette | Required experience |
| --- | --- | ---: | --- | --- |
| 1 | Warm-up | 5 | Evergreen | Open or display the verified Google Form with 3 fluency and 2 prior-learning retrieval questions. |
| 2 | Review | 4 | Evergreen | Review selected warm-up or prior-learning evidence. |
| 3 | Launch | 4 | Scenario-owned | Establish the story, quantity, and question without adding a separate timed quiz state. |
| 4 | Concrete | 5 | Forest | Build or manipulate the concrete model. |
| 5 | Representational | 5 | Teal | Connect the model to a diagram or representation. |
| 6 | Abstract | 5 | Indigo | Connect the representation to notation and reasoning. |
| 7 | Midlesson learning check | 3 | Plum and gold | Revisit the learning intention and success criteria, then collect Fist-to-Five. |
| 8 | Discussion | 6 | Burnt orange | Run three two-minute discussion cycles. |
| 9 | Independent paper work | 14 | Navy | Complete the full required crafted paper set; show directions and support without duplicating problems. |
| 10 | Exit ticket | 3 | Burgundy | Open the assigned exit ticket and make submission state explicit. |
| 11 | Closeout | 1 | Warm gold | Confirm required work, turn-in status, and the next class action. |

Total: 55 minutes.

Diagnostic questions may be embedded in the launch, CRA phases, or discussion. They do not add unapproved minutes or insert extra automatic phases.

## Semantic color contract

- Warm-up and review: evergreen.
- Launch: the active scenario owns its palette.
- Concrete: forest.
- Representational: teal.
- Abstract: indigo.
- Midlesson learning check: plum with gold emphasis.
- Discussion: burnt orange.
- Independent paper work: navy.
- Exit ticket: burgundy.
- Closeout: warm gold.

Projectors use dark tonal fields and soft glow. Chromebooks use warm cream with a matching accent. Text labels and familiar icons accompany every color state; color is never the only signal.

## Warm-up contract

- The current Google Form workflow remains the source of the warm-up questions and response collection.
- Big Dog Math may display, link to, or open that form.
- Big Dog Math must not invent a parallel native warm-up form for this pilot.
- The assigned form remains 3 fluency questions plus 2 prior-learning retrieval questions.

## Independent paper work contract

- The crafted paper set is required in full.
- The website lists every required problem number from the assigned paper set, but does not reproduce the problem text.
- The website shows due information, turn-in information, and a clear help path.
- A teacher may assign one optional digital manipulative as support.
- Every crafted set includes one optional Big Dog Challenge.
- The teacher grades the paper manually and later enters paper results and challenge points.
- Paper scanning and automated paper grading are outside this pilot.

## Today and closeout contract

The Today or closeout view may show these categories:

- Required Paper Work
- Required Digital Work
- Optional Support
- Challenge

Empty categories are hidden. Competition games and tools appear only when they are deployed or assigned for the active lesson.

## Timer and advancement contract

- Auto-advance defaults to off for every new session and every new sequence run.
- Reconnecting a teacher device must not turn auto-advance on.
- At zero, the timer chimes once and changes to an explicit `Time is up` state.
- Reaching zero does not advance the phase, close a response, submit student work, or erase a draft.
- Only the teacher advances the phase by default.
- An explicitly enabled future auto-advance mode is outside this pilot unless separately approved.

## Student draft and connectivity contract

- Drafts are stored locally under the active session and response identifier.
- Teacher state changes may hide an action, but must not erase its unfinished draft.
- A draft is cleared only after a confirmed successful submission or an explicit student discard after the session ends.
- Losing the live connection keeps the current action and draft visible with a `Reconnecting` notice.
- The interface uses explicit states: `Editing`, `Saving`, `Saved`, `Could not save`, `Reconnecting`, and `Submitted`.
- A failed submission remains editable and retryable.
- The interface must not claim `Submitted` until the server confirms the write.

## Synchronization and session safety

- Every projector, Chromebook, and iPad state is tied to an explicit session identifier.
- The teacher Remote shows enough session identity to prevent silently controlling an older open session.
- Commands carry a unique identifier and are safe to receive more than once.
- A command result is visible on the Remote as sending, received, or failed.
- Public projectors may show anonymous class aggregates. Student names and individual responses stay on the private Remote.
- The pilot begins with one newly started session after the teacher confirms the lesson and class. An older open session is not selected merely because it is open.

## Live data shape required by the pilot

The synchronized presentation snapshot must support these concepts, whether implemented as existing fields or additive fields:

- session identifier and join code
- lesson code and lesson title
- current phase identifier, phase label, and semantic phase type
- current directions
- current main-projector content and presentation mode
- learning intention and success criteria
- next phase label and next directions
- timer duration, remaining time, running state, and zero state
- manual advancement policy
- assigned link or tool
- paper-work requirements, turn-in information, help path, and optional manipulative
- response type, response state, and aggregate response data
- command identifier and command receipt state

The app must read structured Notion fields and related Lesson Step records for app-facing content. It must not depend on page-body prose for critical behavior.

## Resolved implementation conflicts

1. The live M2.T1.L1 Day 1 Lesson Steps now use the exact 55-minute pilot sequence and no longer insert separate one-minute live-question phases.
2. Every live pilot step now uses manual advancement.
3. The control sequence defaults auto-advance to off and leaves it off when a sequence starts.
4. Student drafts are keyed to the session and response identifier and are restored after teacher state changes.
5. The presentation snapshot now exposes semantic phase, lesson context, next-step context, timer policy, and paper-work fields.
6. The Pace + Support projector is implemented at `/teacher/pace`.
7. The Chromebook live-flow surface uses the approved warm cream ground with semantic accents.
8. The Remote requires explicit session selection and identifies the session by join code and start time. The older open Supabase session remains untouched and is not silently selected.
9. The shared repository was reconciled against the current remote branch while preserving user and agent work.

## Pilot acceptance criteria

### Main projector

- The current mathematical content is readable from the back of the room.
- The phase, timer, and success criteria remain visible without crowding the work region.
- Every semantic phase changes the tonal field and keeps a text label.
- No private data appears.

### Pace + Support projector

- Current directions, time, next action, and approved support remain visible.
- Zero time produces one chime and `Time is up` without advancing.
- No teacher controls or private data appear.

### Chromebook

- Only one current action is emphasized.
- Warm-up opens the assigned Google Form.
- Paper work lists requirements and support without duplicating paper problems.
- A typed draft survives at least two teacher phase changes and reconnects.
- Saving, failure, reconnecting, and submitted states can each be observed.

### iPad Remote

- The teacher confirms the intended session before sending a command.
- Previous, next, timer, and audio commands show receipt or failure.
- Auto-advance remains off at session start and after reconnect.
- Student-level data remains private to the iPad.

### End-to-end

- One newly created M2.T1.L1 Day 1 session drives all four roles.
- The complete 55-minute sequence matches this contract.
- The two projectors, one Chromebook, and one iPad remain on the same session and phase.
- The pilot can recover from a temporary Chromebook disconnect without losing a draft.
- The timer reaches zero without automatic advancement.
- The lesson closes with only non-empty Today categories visible.

## Outside this pilot

- Native Big Dog Math warm-up authoring or response collection
- Paper scanning or automated paper grading
- Automatic phase advancement
- Unassigned competition games or tools
- A broad rollout to other lessons before the M2.T1.L1 pilot is verified
