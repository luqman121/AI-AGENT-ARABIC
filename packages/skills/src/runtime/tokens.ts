/**
 * Provider-neutral token estimate. Real tokenizers differ per model, so this
 * is a deliberately conservative heuristic used only for prompt budgeting and
 * internal debugging metadata — never for billing. Mixed Arabic/English text
 * averages a little under four characters per token; we round up to stay on
 * the safe side of a budget.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.5);
}
