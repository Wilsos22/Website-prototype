export const SUCCESS_CRITERION_SETUP_PLACEHOLDER = "Choose one I can statement in Notion.";

export type SelectedSuccessCriterionIssue = "missing" | "multiple" | "not-i-can" | null;

export interface SelectedSuccessCriterionInspection {
  criterion: string;
  issue: SelectedSuccessCriterionIssue;
  message: string | null;
}

function normalizeCriterionLine(value: string): string {
  return value
    .trim()
    .replace(/^(?:[-*]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .replace(/^i\s+can\b/i, "I can");
}

/**
 * Validate the lesson-level Selected Success Criterion field.
 *
 * The legacy Success Criteria field can contain a menu of options. It must
 * never be used here: this helper accepts only the deliberately selected
 * lesson statement and requires one complete, line-based I can statement.
 */
export function inspectSelectedSuccessCriterion(
  value: string | null | undefined,
): SelectedSuccessCriterionInspection {
  const lines = (value || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(normalizeCriterionLine)
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      criterion: "",
      issue: "missing",
      message: "Choose one Selected Success Criterion in Notion before saving or starting this lesson.",
    };
  }

  if (lines.length > 1 || (lines[0].match(/\bI\s+can\b/gi)?.length || 0) > 1) {
    return {
      criterion: "",
      issue: "multiple",
      message: "Selected Success Criterion must contain exactly one I can statement on one line.",
    };
  }

  const criterion = lines[0];
  if (!/^I can(?:\s|$)/.test(criterion)) {
    return {
      criterion: "",
      issue: "not-i-can",
      message: "Selected Success Criterion must be written as one I can statement.",
    };
  }

  return { criterion, issue: null, message: null };
}

export function selectedSuccessCriterion(
  value: string | null | undefined,
): string {
  return inspectSelectedSuccessCriterion(value).criterion;
}

export function publicSuccessCriterion(
  value: string | null | undefined,
): string {
  return selectedSuccessCriterion(value) || SUCCESS_CRITERION_SETUP_PLACEHOLDER;
}

export function selectedSuccessCriterionValidationMessage(
  value: string | null | undefined,
): string | null {
  return inspectSelectedSuccessCriterion(value).message;
}
