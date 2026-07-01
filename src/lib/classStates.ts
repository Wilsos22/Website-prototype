// Big Dog Math — canonical class-state catalog.
// Single source of truth for the control panel AND the standalone Sequence
// Builder, so labels/colors/default minutes never drift between the two.

export interface ClassState {
  id: string;
  label: string;
  minutes: number;
  color: string;
  desc: string;
}

export const DEFAULT_STATES: ClassState[] = [
  { id: "warmup", label: "Warm-Up", minutes: 10, color: "#4e6ef2", desc: "Silently begin your warm-up. Work on your own." },
  { id: "review", label: "Go Over / Review", minutes: 5, color: "#8b5cf6", desc: "Eyes up — we're going over the answers together." },
  { id: "i-do", label: "Direct Instruction (I do)", minutes: 15, color: "#0ea5e9", desc: "Watch and take notes. I'll model each step." },
  { id: "we-do", label: "Guided Practice (We do)", minutes: 10, color: "#14b8a6", desc: "We'll solve these together — try each step with me." },
  { id: "discussion", label: "Discussion (Think–Pair–Share)", minutes: 3, color: "#06b6d4", desc: "Think on your own, then talk it through with your group." },
  { id: "question", label: "Question", minutes: 2, color: "#8b5cf6", desc: "Respond to the question before the timer ends." },
  { id: "poll", label: "Live Poll", minutes: 1, color: "#ec4899", desc: "Share a quick check-in before results appear." },
  { id: "tool-whiteboard", label: "Whiteboard", minutes: 5, color: "#0ea5e9", desc: "Use the whiteboard to show and explain your thinking." },
  { id: "tool-number-line", label: "Number Line", minutes: 5, color: "#38bdf8", desc: "Model the problem on the number line." },
  { id: "tool-percent-bar", label: "Percent Bar", minutes: 5, color: "#f472b6", desc: "Use the percent bar to make sense of the relationship." },
  { id: "tool-equation-builder", label: "Equation Builder", minutes: 6, color: "#2f9e6f", desc: "Build and solve the equation one step at a time." },
  { id: "tool-gems", label: "GEMS", minutes: 5, color: "#a78bfa", desc: "Use GEMS to decide which operation comes first." },
  { id: "tool-fraction-bars", label: "Fraction Bars", minutes: 5, color: "#f59e0b", desc: "Model the fraction relationship with bars." },
  { id: "tool-algebra-tiles", label: "Algebra Tiles", minutes: 6, color: "#fb7185", desc: "Build the expression with algebra tiles." },
  { id: "tool-area-model", label: "Area Model", minutes: 6, color: "#fcaf38", desc: "Build the rectangle and split it into partial products." },
  { id: "tool-combine", label: "Combine Like Terms", minutes: 6, color: "#f95335", desc: "Group like terms and simplify the expression." },
  { id: "tool-ladder", label: "Ladder Method", minutes: 6, color: "#674a40", desc: "Divide down the ladder to find GCF and LCM." },
  { id: "tool-proportions", label: "Proportions", minutes: 6, color: "#50a3a4", desc: "Find the scale factor and the missing value." },
  { id: "tool-group-bars", label: "Group Bars", minutes: 5, color: "#2f9e6f", desc: "Build equal groups — fractions, decimals, percents." },
  { id: "tool-coordinate-grid", label: "Coordinate Grid", minutes: 6, color: "#4d8df6", desc: "Plot and identify points on the plane." },
  { id: "tool-term-identifier", label: "Identify Terms", minutes: 5, color: "#50a3a4", desc: "Sort coefficient, variable, operation, and constant." },
  { id: "tool-multiplication", label: "Multiplication Facts", minutes: 6, color: "#4d8df6", desc: "Fast multiplication facts practice." },
  { id: "tool-game", label: "🎮 Live Game", minutes: 5, color: "#7c5cd6", desc: "Compete in a quick auto-scored challenge — live leaderboard." },
  { id: "tool-exit-ticket", label: "📝 Exit Ticket (collect)", minutes: 5, color: "#f95335", desc: "Answer the exit ticket on your own and turn it in." },
  { id: "tool-checkpoint", label: "✅ SBAC Checkpoint", minutes: 5, color: "#50a3a4", desc: "Answer the checkpoint question — it shows what you've mastered." },
  { id: "you-do", label: "Independent Practice (You do)", minutes: 15, color: "#2f9e6f", desc: "Work independently. Show all of your steps." },
  { id: "manip", label: "Manipulatives / Hands-On", minutes: 10, color: "#f59e0b", desc: "Use the manipulative to model the problem." },
  { id: "partner", label: "Partner / Group Work", minutes: 10, color: "#ec4899", desc: "Work with your partner — both of you explain your thinking." },
  { id: "exit", label: "Exit Ticket", minutes: 5, color: "#f95335", desc: "Complete your exit ticket on your own and turn it in before the timer ends." },
  { id: "cleanup", label: "Clean Up / Pack Up", minutes: 3, color: "#64748b", desc: "Clean your space and pack up quietly." },
  { id: "break", label: "Brain Break", minutes: 3, color: "#a3a3a3", desc: "Quick brain break — reset and get ready to focus." },
];

export const BANK_GROUPS = [
  {
    id: "class",
    label: "Class States",
    hint: "Room routines and teacher-led lesson flow",
    stateIds: ["warmup", "review", "i-do", "we-do", "discussion", "you-do", "partner", "exit", "cleanup", "break"],
  },
  {
    id: "feedback",
    label: "Feedback & Games",
    hint: "Questions, checks for understanding, polls, and live games",
    stateIds: ["question", "poll", "tool-game", "tool-exit-ticket", "tool-checkpoint"],
  },
  {
    id: "process",
    label: "Guided Processes",
    hint: "Step-by-step math thinking routines",
    stateIds: ["tool-gems", "tool-equation-builder", "tool-combine", "tool-ladder", "tool-proportions", "tool-term-identifier"],
  },
  {
    id: "manipulatives",
    label: "Manipulatives",
    hint: "Student screens switch to digital math tools",
    stateIds: ["tool-whiteboard", "tool-number-line", "tool-percent-bar", "tool-fraction-bars", "tool-algebra-tiles", "tool-area-model", "tool-group-bars", "tool-coordinate-grid", "tool-multiplication", "manip"],
  },
] as const;
