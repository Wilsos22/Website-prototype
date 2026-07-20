# Claude Design update brief: M2.T1.L1 classroom pilot

Revise the existing Big Dog Math M2.T1.L1 wireframe in place. Produce one final, internally consistent design direction. Do not create alternate compositions.

The controlling specification is `docs/m2-t1-l1-classroom-pilot-ux-contract.md`. The existing wireframe is reference material only where it does not conflict with this brief.

## Core experience

Design four synchronized surfaces:

1. Main interactive projector at 1920 by 1080, safe down to 1280 by 720.
2. Pace and Support projector at 1920 by 1080, safe down to 1280 by 720.
3. Student Chromebook at 1366 by 768, safe down to 1280 by 720.
4. Private teacher iPad Remote at 1194 by 834, with a usable portrait fallback.

Use Albert Sans with bold, direct hierarchy. The experience should feel inviting, mature, calm, and high-contrast, not childish.

## Required corrections to the existing wireframe

- Remove every floating timer pill from the working area. Put time in a fixed top frame.
- Remove projector timer toolbars and lists of possible lesson states.
- The Pace projector shows the timer and only the current directions.
- Remove the learning intention and success criterion from warm-up, review, launch, concrete, representational, and abstract frames.
- First reveal the learning intention and one selected `I can` success criterion at the midlesson learning check.
- Never show multiple success-criteria choices to students.
- Make Chromebook type compact and readable rather than projector-sized.
- The Chromebook arrival sequence is class code, `Code accepted`, student homepage, assigned Google Form warm-up, return to the homepage with solo challenge activities unlocked, then automatic live-lesson entry when the teacher advances beyond Warm-Up.
- Do not show the join code after the student enters the lesson.
- Warm-up review is a brief look at answers and frequently missed problems. Do not design a digital correction flow.
- Use the beginning halftime score problem for the launch scoreboard. This is not the Google Form.
- Discussion must include the current prompt, round number, sentence stems, and vocabulary.
- After the midlesson readiness check, design a private `City Routes` transition. The system chooses three names from an editable ten-city bank, rotates both the names and their instructional meanings between lessons, and lets the teacher shuffle, override, and release assignments from the iPad without calling names publicly.
- The student route result shows only one city, its physical destination, required materials, and first action. Do not show a score, tier, misconception label, or ability-group language.
- Public projectors may show an anonymous city-to-location key but never student names or route rosters.
- Loading a lesson is a preview state. Pressing `Start lesson` turns on automatic pacing and starts the current timer.
- The selected lesson's warm-up is available from the accepted-code homepage before `Start lesson`; student access never depends on the pacing timer.
- Challenge activities unlock only after the assigned Google Form completes the current session's receipt; an identity link from a previous day is not enough.
- Add a quiet `Warm-up not connecting? Ask for help` recovery beneath the normal automatic path. It is not a required approval step.
- At zero, show `Time is up`, chime once, and advance to the next scheduled state after a brief transition.
- A timed response check closes at zero, shows results briefly, and then advances.
- Pause holds the current state and stops advancement. Resume continues from the remaining time. Stop ends the pacing run.
- Manual Back or Next preserves the current pacing state: running stays running and paused stays paused.
- The iPad Remote must include an `Open work space` action. When selected, the main projector adds a writing panel beside the current problem so the problem stays visible. `Back to Remote` closes the panel and restores the same problem view.
- Add an `End session` action with confirmation to the private Remote and laptop control flow.
- Strip any information that does not directly serve the current slide.

## Visual system

Projectors use dark tonal fields with a soft glow. Chromebooks use the existing warm cream ground with the matching phase accent. Keep a text label or familiar non-emoji icon with each color state.

Use these current implementation tokens as the visual source of truth:

| Phase | Accent | Projector base | Projector panel |
| --- | --- | --- | --- |
| Warm-up and review | `#6fbd91` | `#0c1d17` | `#132a20` |
| Launch scenario | `#d59a55` | `#21150d` | `#302016` |
| Concrete | `#69b17f` | `#0d1c13` | `#14271b` |
| Representational | `#58b8b4` | `#0b1d1f` | `#10292b` |
| Abstract | `#8291e8` | `#11152b` | `#191f3b` |
| Learning check | `#d2a74f` | `#241329` | `#321a38` |
| Discussion | `#cf6b42` | `#27130d` | `#351b13` |
| Independent paper work | `#6f91c6` | `#0d1829` | `#14233a` |
| Exit ticket | `#c9687c` | `#281018` | `#371721` |
| Closeout | `#d1a64d` | `#21190d` | `#2e2414` |

## Required 55-minute frame set

Create synchronized frames for all four roles across this exact sequence:

1. Warm-up, 5 minutes
2. Review, 4 minutes
3. Launch, 4 minutes
4. Concrete, 5 minutes
5. Representational, 5 minutes
6. Abstract, 5 minutes
7. Midlesson learning check and Fist-to-Five, 3 minutes
8. Discussion, three rounds of 2 minutes
9. Independent paper work, 14 minutes
10. Exit ticket, 3 minutes
11. Closeout, 1 minute

For each phase, label what appears on the Main projector, Pace projector, Chromebook, and iPad Remote. Do not add extra timed phases.

## Required component and state frames

Include reusable component specifications and at least one frame for each of these states:

- loading and connecting
- no session selected
- session confirmed
- class code accepted
- warm-up link missing or not published
- waiting for verified warm-up submission
- reconnecting while preserving current work
- editing, saving, saved, save failed, and submitted
- command sending, received, failed, and disconnected
- City Routes loading, teacher review, individual override, `Shuffle cities`, released, staggered release, student assignment, `Needs assignment`, and reconnect recovery
- lesson loaded, automatic pacing started, paused, resumed, stopped, and `Time is up`
- board panel closed and side-by-side board panel open
- end-session confirmation and session ended
- empty optional category hidden

## Content fidelity

- Warm-up remains the assigned Google Form with three fluency and two prior-learning retrieval questions.
- The halftime launch shows the beginning score and the current math question.
- Discussion supports include sentence stems and key vocabulary.
- Independent practice is paper-first. Show required problem numbers, due and turn-in information, help path, and one optional assigned manipulative without reproducing paper problems.
- The crafted paper set is required in full and has one optional Big Dog Challenge.
- Closeout hides empty categories and shows games or tools only when assigned.

## Deliverables

Return one revised handoff package containing:

1. One role-by-phase matrix for the four synchronized surfaces.
2. Final annotated frames for all 11 phases across the four roles.
3. The required loading, empty, failure, reconnect, save, submit, timer-zero, board, and end-session states.
4. A component and token sheet using the values above.
5. A revised `lesson-sequence.json` with the exact 55-minute sequence, loaded-but-not-started preview, automatic pacing after `Start lesson`, pause and stop controls, and exactly one selected success criterion.
6. One final handoff HTML file. Do not include competing layout variants.

Name the export with the lesson code and revision date. Place the new package in `Claude Design Wireframe/` without deleting the earlier export so the change can be audited.

## Final self-check before export

- Every frame serves one current instructional purpose.
- The two projectors are visibly different roles.
- The Chromebook has one current action and no persistent code.
- The iPad is both the remote and the writing surface without replacing the problem on the main projector.
- Warm-up has no lesson target.
- Midlesson has exactly one `I can` statement.
- City Routes privately direct each student without exposing scores or permanent group labels, and both city names and route meanings rotate between lessons.
- Discussion includes stems and vocabulary.
- Start lesson enables automatic pacing; Pause holds the state, and timer zero advances after its transition.
- Navigation reaches every phase through closeout.
- No emoji appears anywhere.
