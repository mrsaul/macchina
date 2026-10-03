import type { Intent } from "./schema";

/** Lowercase, strip accents and collapse whitespace so "Fumée" matches "fumee". */
export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keyword-based intent tagging, driven entirely by the pack. Shown instantly
 * while the assistant answers, then replaced by the model's own intents; safety
 * intents found here are always kept. Safety intents come first.
 */
export function classifyIntents(text: string, intents: Intent[]): Intent[] {
  const haystack = normalize(text);
  const matches = intents.filter((intent) => intent.keywords.some((k) => haystack.includes(normalize(k))));
  return matches.sort((a, b) => Number(b.safety) - Number(a.safety));
}
