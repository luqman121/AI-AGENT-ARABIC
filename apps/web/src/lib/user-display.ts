/** First token of the user's display name, with a neutral Arabic fallback. */
export function firstNameOf(name: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "بك";
  return trimmed.split(/\s+/)[0] ?? "بك";
}
