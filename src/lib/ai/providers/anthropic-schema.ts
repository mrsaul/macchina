import { z } from "zod";

// Keywords outside the structured-outputs JSON-schema subset. They are dropped
// from what the API sees and still enforced by Zod on the way back.
const UNSUPPORTED_KEYWORDS = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "maxItems",
  "uniqueItems",
]);

/**
 * Zod → JSON schema for structured outputs. Written here rather than using the
 * SDK's zod helper because SDK 0.131 turns `enum` into a description, which
 * would leave values like kind = "info" | "question" | "command" unenforced.
 */
export function toStructuredOutputSchema(schema: z.ZodType): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (UNSUPPORTED_KEYWORDS.has(key)) continue;
      if (key === "minItems" && value !== 0 && value !== 1) continue;
      out[key] = key === "enum" || key === "const" || key === "required" ? value : strip(value);
    }
    if (out.type === "object") out.additionalProperties = false;
    return out;
  };
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>;
}
