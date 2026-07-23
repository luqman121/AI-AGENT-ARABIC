import type { DesignReview } from "@wakil/skills";

import {
  generateStaticSite,
  type StaticSiteGenerationInput,
  type StaticSiteGenerationResult,
} from "./static-site.js";
import { reviewStaticSiteHtml } from "./website-review.js";

export type DesignReviewOption = {
  /** Off by default; when false, behaves exactly like `generateStaticSite`. */
  enabled: boolean;
  /** Clamped to [0, 2] — never an unlimited correction loop. Defaults to 1. */
  maxRepairAttempts?: number;
};

export type StaticSiteWithReviewInput = StaticSiteGenerationInput & {
  designReview?: DesignReviewOption;
};

export type StaticSiteWithReviewResult = StaticSiteGenerationResult & {
  /** Present whenever the review ran (i.e. generation succeeded and review was enabled). */
  review?: DesignReview;
  /** Number of repair (re-generation) passes actually performed, always ≤ the configured cap. */
  repairAttempts: number;
};

const DEFAULT_MAX_REPAIR_ATTEMPTS = 1;
const HARD_REPAIR_CAP = 2;

/**
 * Generates a static site and, when design review is enabled, runs the
 * heuristic Design Critic against the result and performs a bounded number
 * of repair passes (re-generation with the critic's findings appended as
 * repair notes) when blocking issues are found.
 *
 * This function never claims an artifact is ready when blocking issues
 * remain: it returns the last generated HTML together with the final
 * `review` (whose `passed` flag reflects reality). Callers — the worker
 * processor — decide whether an unresolved `review.passed === false` should
 * fail the run; this function's job is to report honestly, not to hide a
 * failure behind a successful-looking result.
 */
export async function generateStaticSiteWithReview(
  input: StaticSiteWithReviewInput,
): Promise<StaticSiteWithReviewResult> {
  const reviewEnabled = input.designReview?.enabled ?? false;
  const maxRepairAttempts = Math.max(
    0,
    Math.min(HARD_REPAIR_CAP, input.designReview?.maxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS),
  );

  let current = await generateStaticSite(input);
  if (!current.ok || !reviewEnabled) {
    return { ...current, repairAttempts: 0 };
  }

  let review = reviewStaticSiteHtml(current.html);
  let attempts = 0;

  while (!review.passed && attempts < maxRepairAttempts) {
    attempts += 1;
    const repairNotes = [...review.blockingIssues, ...review.majorIssues].map(
      (issue) => issue.message,
    );
    const repaired = await generateStaticSite({ ...input, repairNotes });
    if (!repaired.ok) {
      // The repair attempt itself failed to produce output. Stop repairing
      // and report the last known-good generation with its (failing) review
      // rather than losing it or fabricating success.
      return { ...current, repairAttempts: attempts, review };
    }
    current = repaired;
    review = reviewStaticSiteHtml(current.html);
  }

  return { ...current, repairAttempts: attempts, review };
}
