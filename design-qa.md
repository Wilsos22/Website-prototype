# M2.T1.L1 Multi-Screen Pilot Design QA

## Surfaces checked

- Student lesson home: compared the Figma frame at 1265 x 712 with the local `/today?preview=1` implementation at the same viewport.
- Projector lesson stage: compared the Figma projector frame with the local `/teacher/present?preview=ratio` implementation.
- Student live flow: checked `/live-flow?preview=ratio` for prompt hierarchy, timer visibility, directions, and the light Chromebook treatment.
- Annotation mirror: checked the iPad drawing surface and second-panel `/board` surface in the same room.

## Visible corrections made

- Kept the visual lesson explainer borderless and moved its play/pause control to the lower-right corner.
- Kept the lesson title above the video rather than overlaying it.
- Matched the student layout with a lesson-information hero on the left and a wider vertical action rail on the right.
- Preserved the orange warm-up action and differentiated Join Class, Assignment, and Exit Ticket.
- Made the current prompt and student work the visual focus of the live-flow and projector surfaces.
- Kept the projector dark for distance visibility while using a lighter Chromebook surface.
- Added a compact draggable ratio model without scoring, persistence, or extra student-data collection.
- Made the projector annotation canvas the work hero and retained the lesson label and timer in the frame.

## Functional checks

- The ratio model supports drag/tap placement, removal, reset, and a 3-blue-to-2-yellow preset.
- M2.T1.L1 expands the 15-minute CRA segment into five minutes each of Concrete, Representational, and Abstract work.
- The exact discussion-round teacher notes flow to the student and projector content surfaces.
- The mid-lesson Fist-to-Five state includes the learning intention and success criteria.
- The iPad Back, Start/Pause, Next, and Add 30 Seconds controls are connected to the existing teacher remote endpoint.
- The iPad annotation stroke mirrored onto the second-panel board in a shared local room.
- TypeScript typecheck and production build passed.

## Known verification boundary

- Live Supabase remote commands were not exercised end-to-end because no active live class session was available in the local environment. The endpoint wiring and local UI states were verified.
- This branch has not been merged, pushed, or deployed.

passed
