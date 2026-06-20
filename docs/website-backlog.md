# Big Dog Math Website Backlog

This is the working backlog for the Big Dog Math website and classroom control system. It is intentionally broad so it can be split into smaller issues as each area is built.

## 1. Live Class Flow Stability

- [ ] Verify students can leave `/live-flow` and return to the normal website without being redirected back.
- [ ] Verify joining a new session clears the previous Live Flow exit state.
- [ ] Confirm teacher browsers are not redirected by student class-sync logic.
- [ ] Confirm the homepage `/` stays usable even when a student session is saved.
- [ ] Confirm `/join` can switch to a different session cleanly.

## 2. Control Center Sequencer

- [ ] Add a Run button that automatically advances through each configured state or phase using its timer.
- [ ] Keep manual Next and Back behavior available while auto-run is active.
- [ ] Allow pausing or stopping auto-run without breaking the current state.
- [ ] Organize the sequencer bank by type:
  - Manipulatives
  - Guided process, such as GEMS
  - Class state
  - Feedback, polls, and questions

## 3. Poll And Question States

- [ ] Add Question as a control-panel state.
- [ ] Let the teacher enter the question text.
- [ ] Support Short Answer questions.
- [ ] Support Multiple Choice questions.
- [ ] Add Poll as a sequencer state.
- [ ] Support Fist to 5 as a slider poll.
- [ ] Support custom teacher-written polling questions.
- [ ] Give each question or poll state an adjustable response timer.
- [ ] After the timer, advance to a results screen.

## 4. Manipulatives In Live Flow

- [ ] Allow manipulative tools to be inserted into the control-center sequence.
- [ ] Student Chromebooks should automatically switch to the selected tool during Live Flow.
- [ ] Add backend/config options for each manipulative so the teacher can pre-set the problem.
- [ ] Support Whiteboard.
- [ ] Support Number Line.
- [ ] Support Percent Bar.
- [ ] Support Equation Builder.
- [ ] Support Fraction Bars.
- [ ] Support Algebra Tiles.
- [ ] Support GEMS/order-of-operations flow.

## 5. Student Live Flow Media

- [ ] Add media support for each sequence item or phase.
- [ ] Show teacher-created animations or videos on student screens during the matching phase.
- [ ] Keep media student-facing only, with no teacher controls.
- [ ] For Think-Pair-Share, support dynamic direction animations for:
  - Thinking Time
  - Commit Your Thinking
  - Discuss with Your Table
  - Revise Your Answer
  - Share Out

## 6. Visual Language Cleanup

- [ ] Remove smiley-face-style emoji from the website UI.
- [ ] Replace smiley-face-style emoji with neutral icons, symbols, or non-face emoji where needed.
- [ ] Keep the Big Dog Math style clean, readable, and student-friendly.

## 7. Student-Facing Website

- [ ] Make the student-facing site feel like a real website, not just a tool page.
- [ ] Preserve the useful structure from the old Google Sites page.
- [ ] Keep `/today` as the daily student homebase.
- [ ] Keep `/lessons` as the archive for absent students.
- [ ] Pull published lessons from Notion.
- [ ] Show warm-up, lesson, assignment, due date, essential ideas, and session/join information clearly.

## 8. Warm-Up And Notion Sync

- [ ] Fix form response score flow so scores show correctly in the spreadsheet.
- [ ] Sync submissions into Notion reliably.
- [ ] Support the newer Notion setup with multiple databases/data sources.
- [ ] Use the student's key field/email to link submissions to the correct student page.
- [ ] Link each submission to the correct warm-up page.
- [ ] Preserve score grouping:
  - Score below 3: Intervention / red / needs follow-up
  - Score 3: Almost / yellow
  - Score 4-5: Got It / green
- [ ] Avoid overwriting teacher-edited fields in Notion.

## 9. Deployment And Release Checks

- [ ] Keep unrelated warm-up/script changes separate from website fixes when committing.
- [ ] Run `npm run typecheck` before pushing.
- [ ] Run `npm run build` before pushing.
- [ ] Push to GitHub and verify Vercel redeploys.
- [ ] Test on the live `bigdogmath.com` site after deployment.

