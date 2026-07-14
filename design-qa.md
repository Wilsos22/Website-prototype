# M2.T1.L1 Classroom Pilot Design QA

Source visual truth path: `/Users/steelewilson/Documents/Website prototype/Claude Design Wireframe/BigDogMath Lesson Wireframe-handoff.zip`

Source capture: `/private/tmp/bdm-source-wireframe-3a-1440x900.png`

Implementation screenshot: `/private/tmp/bdm-impl-projector-1440x900.png`

Full-view comparison evidence: `/private/tmp/bdm-projector-comparison-1440x900.png`

Additional browser evidence:

- Pace and Support projector: `/private/tmp/bdm-pace-projector-1440x900.png`
- Private teacher Remote: `/private/tmp/bdm-teacher-remote.png`
- Chromebook current action: `/private/tmp/bdm-student-current-action.png`
- Chromebook reconnect state: `/private/tmp/bdm-student-reconnect.png`

Viewport: the source and main projector implementation were captured at 1440 by 900 CSS pixels with device scale 1. The Pace projector used the same viewport. The Chrome extension exposed an 826 by 747 CSS-pixel viewport for the private Remote and Chromebook checks; the Remote evidence is a full-page capture.

State: M2.T1.L1 lesson launch for the source comparison, with a running 4-minute launch timer at 2:42. Additional surfaces used the same confirmed pilot session. The Chromebook current-action check used the independent paper-work state, and the reconnect check used the explicit draft-safe error state.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The implementation preserves the wireframe's major hierarchy: maximum mathematical work area, success criteria in the upper-right, and a floating timer and state pill below the work.
- The dark scenario palette is an intentional approved product constraint rather than design drift from the wireframe's neutral documentation canvas.

## Required Fidelity Surfaces

- Fonts and typography: Albert Sans is used through the existing `--bdb-font` token. Display and timer weights are optically strong at projector distance; small labels use consistent uppercase tracking. No clipping, unintended truncation, or broken wrapping was visible at the verified projector viewport.
- Spacing and layout rhythm: the work region owns the screen, success criteria remain in a quiet corner, and the floating pill no longer competes with the primary problem. Borders, radii, footer height, and gaps remain consistent across the main and Pace projectors.
- Colors and visual tokens: the implementation uses the approved semantic scenario palette with tonal dark glows and maintains high foreground contrast. The Chromebook stays warm cream with the independent-state navy accent. Labels remain present so color is not the only signal.
- Image quality and asset fidelity: the target does not contain a required logo, illustration, product image, or non-standard icon. No visible target asset was replaced with CSS art, custom SVG, emoji, or a placeholder image.
- Copy and content: lesson code, current action, success criteria, next step, paper requirements, turn-in path, help path, optional support, and challenge wording stand alone without relying on implementation instructions.

## Focused Region Comparison

The native-size source and implementation captures were inspected separately for the floating pill, success-criteria card, work-region typography, and footer. No additional crop was needed because those regions were readable at the native 1440 by 900 captures. The combined comparison was used for composition and hierarchy judgment.

## Comparison History

### Iteration 1

- Earlier finding: P1 layout mismatch. The timer and state pill was placed at the upper-left, while approved frame 3a places it below the slide work. This materially changed the major-region hierarchy.
- Fix made: moved `.stage-pill` to the horizontal center below the mathematical work in `src/app/teacher/present/page.tsx`, retained the upper-right success-criteria card, and widened the pill's responsive cap.
- Post-fix evidence: `/private/tmp/bdm-impl-projector-1440x900.png` and `/private/tmp/bdm-projector-comparison-1440x900.png`.
- Result: the earlier P1 finding is resolved.

## Primary Interactions Tested

- Confirmed-session routing for the main projector, Pace and Support projector, and private Remote.
- Private Remote `Next` command POST to the exact selected session and successful receipt from the local browser QA harness.
- Explicit Chromebook reconnect state with `Your draft is safe` messaging.
- Independent paper-work current action with the full required set, due and turn-in direction, help path, optional assigned support, and challenge.
- Empty and connection states remained readable and did not expose private response data on projector or Chromebook surfaces.

The local QA fixture was process-only and removed from the final source after capture. No QA session or fixture remains in application code.

## Console Check

Browser console errors checked for the main projector, Pace projector, private Remote, and Chromebook surfaces: none.

## Open Questions

- None for the approved M2.T1.L1 pilot scope.

## Implementation Checklist

- Run TypeScript verification against the final source.
- Run the production build against the final source.
- Perform the first live classroom pilot with one newly confirmed class session across both projectors, one Chromebook, and the private iPad Remote.

## Follow-up Polish

- P3: repeat the Remote capture on the physical iPad during the live pilot to validate its exact browser chrome and safe-area behavior.

final result: passed
