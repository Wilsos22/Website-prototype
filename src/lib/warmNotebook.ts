// Warm Notebook accents - one semantic color per classroom stage, from turn
// 12e of the Claude Design "Lesson Frame Wireframes" canvas. These are the
// colors students learn to read; every refit surface pulls from THIS map so
// the projectors, Chromebooks, and kit screens can never disagree.
// CLASSROOM_STAGE_THEMES keeps the old dark projector values for surfaces
// that have not been refit yet.

export const WARM_ACCENTS: Record<string, string> = {
  evergreen: "#50A3A4",
  scenario: "#F2820C",
  concrete: "#2E9E5A",
  representational: "#3E7CC0",
  abstract: "#845BC9",
  "lesson-targets": "#FCAF38",
  "learning-check": "#FCAF38",
  discussion: "#F95335",
  independent: "#674A40",
  exit: "#D6567C",
  closeout: "#C9992F",
};

export function warmAccent(stageId: string, fallback: string): string {
  return WARM_ACCENTS[stageId] || fallback;
}
