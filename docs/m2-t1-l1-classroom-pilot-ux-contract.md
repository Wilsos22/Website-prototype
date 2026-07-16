# M2.T1.L1 classroom pilot UX contract

Status: Frozen target for the first front-to-back classroom pilot

Pilot lesson: Math 6 M2.T1.L1, Day 1

Updated: July 14, 2026

## Purpose and source rules

This contract defines the approved 55-minute M2.T1.L1 experience across two projectors, a student Chromebook, and a private teacher iPad Remote.

- The real repository, live Notion schema and lesson records, live Supabase state, and deployed app are the sources of truth for what is currently implemented.
- This contract is the source of truth for the approved pilot behavior.
- Claude Design wireframes are the visual reference only after they have been revised to match this contract.
- A stale wireframe never overrides the contract or a verified live-system constraint.
- Critical app behavior must come from structured Notion properties and Lesson Step records, not page-body prose.

## Four synchronized roles

### Main interactive projector

Route: `/teacher/present`

The main projector owns the mathematical story, current problem, model, representation, or interactive tool.

- Use a rich dark semantic background with a soft tonal glow.
- Give the current mathematical content the largest region.
- Put phase and timer in the fixed top frame. Never float a timer pill over the work.
- Show no projector toolbar.
- Show only information that directly serves the current slide.
- Do not show the learning intention or success criterion during warm-up, review, launch, concrete, representational, or abstract work.
- First show the learning intention and the lesson's one selected `I can` success criterion during the midlesson learning check. They may reappear later when they directly support the current task.
- When the teacher opens the writing work space, add a board panel beside the current problem. Do not replace or cover the problem.
- Never show student names, individual responses, unrevealed answers, or private teacher notes.

### Pace and Support projector

Route: `/teacher/pace`

The second projector keeps the room oriented.

- Put the timer in the top frame.
- Show only the current directions below it.
- Do not show a toolbar, a list of possible states, the full lesson sequence, or private controls.
- At zero, chime once, briefly show `Time is up`, and follow the active pacing mode.
- Show learning intention, the one success criterion, vocabulary, or sentence stems only when the current phase calls for that support.

### Student Chromebook

Route: `/` for arrival, then `/lesson` or the active synchronized lesson surface.

- Use a warm cream ground with the current semantic accent.
- Use compact, readable Chromebook typography. Do not use projector-scale text.
- Keep the lesson timer compact in the top frame instead of placing a large timer in the work area.
- Emphasize exactly one current action.
- Arrival order is class code, code accepted, assigned Google Form warm-up, automatic lesson entry after verified submission.
- Do not show the join code after the student is in the lesson.
- Do not create a native warm-up form.
- During warm-up review, students look at answers and frequently missed problems. They do not digitally correct or resubmit warm-up work.
- During paper-first work, show directions, every required paper problem number, due and turn-in information, the help path, and an optional assigned manipulative. Do not reproduce paper problem text.
- Preserve unfinished drafts through teacher state changes and reconnects.
- Make `Editing`, `Saving`, `Saved`, `Could not save`, `Reconnecting`, and `Submitted` explicit.

### Private teacher iPad Remote

Route: `/teacher/remote`

The iPad is both the private controller and the teacher's writing surface.

- Require the teacher to select and confirm the intended session by lesson, join code, and start time.
- Keep a stable header with the current phase, compact timer, connection state, and End session.
- In landscape, keep compact Main, Pace, and Student mirrors in a 314-pixel rail. In portrait, move the same three mirrors into one compact row above the controls.
- Put only the current state's navigation, timer, whiteboard, spinner, scoreboard, or discussion controls first. Speaker notes and private response data are secondary.
- Keep Abbie, sound cues, projector links, the audio library, and session switching inside collapsed Utilities until the teacher asks for them.
- Show current state, time, directions, next state, and private aggregate or student-level data as appropriate.
- Provide Back, Next state, start or pause, add time, remove time, reset, approved sound controls, and End session.
- Starting the lesson turns on automatic pacing. Pause holds the current state; resume continues the timed sequence.
- `Open work space` manually opens the side-by-side writing panel on the main projector and the writing canvas on the iPad.
- `Back to Remote` closes the writing panel and restores the unchanged problem view.
- Show command states: sending, received, failed, and disconnected.

The dark `/control` page remains the laptop operator and setup surface. It is not a student-facing projector screen.

## Exact 55-minute sequence

| Order | Phase | Minutes | Palette | Current-slide purpose |
| --- | --- | ---: | --- | --- |
| 1 | Warm-up | 5 | Evergreen | Student enters the code and opens the assigned verified Google Form. Projectors show only warm-up directions and time. |
| 2 | Review | 4 | Evergreen | Briefly reveal answers and frequently missed problems; no digital corrections. |
| 3 | Launch | 4 | Scenario-owned | Show the beginning halftime score problem and establish the story, quantities, and question. |
| 4 | Concrete | 5 | Forest | Build the ratio relationship with the assigned concrete model. |
| 5 | Representational | 5 | Teal | Connect the model to a diagram or representation. |
| 6 | Abstract | 5 | Indigo | Connect the representation to notation and reasoning. |
| 7 | Midlesson learning check | 3 | Plum and gold | First show the learning intention and one selected `I can` success criterion, then collect Fist-to-Five. |
| 8 | Discussion | 6 | Burnt orange | Run three two-minute rounds with visible sentence stems and vocabulary. |
| 9 | Independent paper work | 14 | Navy | Complete the full crafted paper set with directions, help path, and optional assigned manipulative. |
| 10 | Exit ticket | 3 | Burgundy | Open the assigned exit ticket and show submission state. |
| 11 | Closeout | 1 | Warm gold | Confirm required work, turn-in status, and the next class action. |

Total: 55 minutes.

Diagnostic prompts may be embedded inside launch, CRA, discussion, or the learning check. They do not add extra automatic states or minutes.

## Semantic visual system

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

Projector surfaces use dark tonal fields and soft glow. Chromebook surfaces stay warm cream with the matching accent. Every state keeps a text label or familiar icon so color is never the only cue.

## Content rules

### Warm-up and review

- The assigned Google Form remains three fluency questions and two prior-learning retrieval questions.
- Big Dog may display, link to, or open the Form.
- The class code must be accepted before the student is sent to the Form.
- Review is a brief teacher-led look at answers and frequently missed problems, not a correction workflow.

### Learning intention and success criterion

- Warm-up is not presented as learning the new lesson objective.
- Neither target appears before the midlesson learning check.
- Each daily lesson selects exactly one success criterion from the options in Notion.
- The student-facing wording is one concise `I can` statement.

### Discussion

- Show the current discussion prompt, round number, sentence stems, and key vocabulary.
- Keep each round to two minutes.
- Do not add unrelated lesson metadata to the slide.

### Independent work and closeout

- The full crafted paper set is required and includes one optional Big Dog Challenge.
- The teacher grades paper manually and later enters results and challenge points.
- Scanning and automated paper grading are outside this pilot.
- Today and closeout may show `Required Paper Work`, `Required Digital Work`, `Optional Support`, and `Challenge`.
- Hide empty categories. Show games and tools only when deployed or assigned.

## Timer, navigation, and draft behavior

- Loading or previewing a lesson does not start it.
- Pressing `Start lesson` enables automatic pacing and starts the current state's timer.
- At zero, chime once, briefly show `Time is up`, and advance to the next scheduled state.
- A timed response check closes at zero, shows results briefly, and then advances.
- Pause holds the current state and stops automatic advancement. Resume continues from the remaining time.
- Stop ends the pacing run and returns the classroom controller to idle.
- Manual Back or Next remains available. If the timer was running, the destination state's timer starts immediately; if it was paused, the destination remains paused.
- Reconnecting restores the current pacing mode, state, and remaining time instead of silently changing them.
- Back and Next state must traverse all 11 approved states; the lesson cannot become stuck on an intermediate page.
- Drafts are stored under the active session and response identifier.
- A failed save or submission remains editable and retryable.
- Do not claim `Saved` or `Submitted` until the server confirms it.

## Session and privacy behavior

- Every surface is tied to an explicit session ID.
- An older open session is never selected silently.
- Starting, managing, and ending a session must produce one consistent session state on Teacher Home, Control, Remote, and student join.
- Ending the session is available from both the laptop control flow and the private Remote, with confirmation.
- Commands have unique identifiers and visible receipt states.
- Public projectors may show anonymous class aggregates. Names and individual responses stay private.

## Required synchronized data

The presentation snapshot must support:

- session ID, join code, lesson code, lesson title, and session status
- current state ID, label, semantic theme, directions, and content mode
- next state label and directions
- exactly one selected success criterion plus the learning intention
- timer duration, remaining time, running state, and zero state
- automatic pacing mode plus paused and stopped states
- projector board-panel open state
- assigned link or tool
- paper requirements, turn-in information, help path, and optional manipulative
- response type, draft state, submission state, and aggregate response data
- command ID and command receipt state

## Pilot acceptance criteria

The pilot passes only when all of these are observed in one new M2.T1.L1 session:

- All four roles connect to the same confirmed session and move through all 11 states.
- Student code entry leads to the assigned Google Form and then automatically into the lesson.
- No join code remains on the active student lesson screen.
- Warm-up and review show no learning intention or success criterion.
- The midlesson check introduces one `I can` success criterion.
- The halftime launch uses the approved beginning-score layout.
- Discussion includes sentence stems and vocabulary.
- The projector timer stays in its top frame, has no toolbar, and shows only current directions on the Pace screen.
- Start lesson carries the class through the timed sequence; Pause holds it, and Resume continues it.
- Opening the iPad work space adds a board beside the current problem, and closing it restores the unchanged view.
- A Chromebook draft survives two state changes and a temporary reconnect.
- Saving, failure, reconnecting, and submitted states are observable.
- No screen contains information that does not directly serve its current state.
- Ending the session removes the contradictory running-session state everywhere.

## Outside this pilot

- Native Big Dog warm-up authoring or response collection
- Paper scanning or automatic paper grading
- Unassigned games or tools
- Broad rollout before this one classroom pilot passes
