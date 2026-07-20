# M2.T1.L1 classroom surface contract

Status: approved classroom pilot reference

Design reference: `Claude Design Wireframe/M2.T1.L1-handoff-2026-07-15.dc.html`

This contract freezes the classroom roles and layout rules that must survive later visual or feature work. It applies to every lesson rendered by the same live-flow system, even though M2.T1.L1 is the first complete pilot.

## Four synchronized roles

- Main interactive projector: the mathematical story, problem, model, or visual. It may open a writing panel beside the problem, but the problem stays visible.
- Pace + Support projector: the fixed timer and only the directions or supports students need now. It does not show the state bank, control toolbar, or private data.
- Student Chromebook: a warm-cream surface with one current action. It may show a response control or an assigned support during independent work. It never keeps the class code on screen after entry.
- iPad Remote: private teacher controls, three compact public-screen mirrors, speaker notes, response data, and phase-specific actions. Its layout stays stable while the state-specific actions and data change.

## Shared visual frame

- Main and Pace are full-bleed dark tonal fields with a soft semantic glow.
- Their fixed 66-pixel top frame contains, in order: Big Dog mark, semantic state dot, current state, optional lesson title, and the timer badge.
- The timer never floats over the working area.
- Chromebook uses a five-pixel semantic top strip, compact header, explicit sync label, optional timer, and student name.
- iPad landscape uses a 58-pixel header, 314-pixel mirror rail, and a scrollable control surface. Portrait moves the mirrors into one row and stacks the same controls below. No control is removed.
- Albert Sans, bold sans-serif hierarchy, compact labels, and a text label for every color-coded state.

## Semantic colors

- Warm-up and review: accent `#6fbd91`, base `#0c1d17`, panel `#132a20`.
- Launch scenario: accent `#d59a55`, base `#21150d`, panel `#302016`.
- Concrete: accent `#69b17f`, base `#0d1c13`, panel `#14271b`.
- Representational: accent `#58b8b4`, base `#0b1d1f`, panel `#10292b`.
- Abstract: accent `#8291e8`, base `#11152b`, panel `#191f3b`.
- Learning check: accent `#d2a74f`, base `#241329`, panel `#321a38`.
- Discussion: accent `#cf6b42`, base `#27130d`, panel `#351b13`.
- Independent: accent `#6f91c6`, base `#0d1829`, panel `#14233a`.
- Exit ticket: accent `#c9687c`, base `#281018`, panel `#371721`.
- Closeout: accent `#d1a64d`, base `#21190d`, panel `#2e2414`.

## Instructional rules

- Warm-up remains the assigned Google Form: three fluency and two prior-learning retrieval questions. The class code opens the student homepage; the amber Warm-up action opens the Form. No teacher-by-teacher admission is required in the normal path.
- Warm-up and review do not show the learning intention or success criterion. Review is teacher-led and does not ask students to correct or resubmit work.
- The learning intention and exactly one selected `I can` success criterion are revealed immediately after the launch hook, read aloud by two spinner-selected students. The same target returns on screen at the midlesson learning check, before the Fist-to-Five. It never appears during warm-up or review.
- Discussion and Error Analysis use three two-minute rounds that include Think and Write, Discuss and Revise, then Share. Sentence stems and vocabulary remain visible on the support surface.
- Independent work is paper-first. The website shows required work, due and turn-in information, help path, optional support, and challenge without duplicating the paper problems. A linked resource must not replace the Main instructional screen.
- Exit ticket is a separate formative state. Closeout only directs students to put away supplies and clean their area.
- Empty assignment categories are hidden.

## Pacing and synchronization

- Loading a lesson is a private preview. Start lesson, or the first explicit Advance from that preview, connects the confirmed session before any screen changes.
- Once started, automatic pacing stays on until the teacher pauses or stops it.
- Back and Next preserve the running or paused condition.
- Timer values are clamped to a valid classroom duration. Corrupt local values never render as an hours-long timer.
- Timer zero provides an explicit chime and transition state before automatic advancement.
- Student drafts survive teacher state changes and reconnects. Editing, saving, saved, failed, submitted, sending, received, and reconnecting states are labeled.

## Remote and writing behavior

- Pacing, timer, and Open work space remain above the fold at 1194 by 834.
- Abbie, sound cues, projector launch links, and session switching live in scrollable Utilities and remain reachable at iPad widths.
- Every Remote command receives immediate local feedback and a confirmed or failed delivery label.
- Open work space keeps the current Main problem visible and opens live writing beside it.
- Apple Pencil ink is drawn locally immediately, batched for transport, and reports connected, connecting, or reconnecting status.
- Notability and Apple Notes are not embedded. The Remote uses its own Pencil surface so the live ink can synchronize with the exact session-bound Main projector.

## Classroom setup

- Laptop: dark `/control` host.
- Main panel: `/teacher/present?session=<live-session-id>`.
- Pace panel: `/teacher/pace?session=<live-session-id>`.
- iPad: `/teacher/remote?session=<live-session-id>`.
- Teacher Home, Control, and Session expose the same exact-session setup hub.
