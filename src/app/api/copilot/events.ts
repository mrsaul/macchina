import type { Classification } from "@/lib/ai/classify";
import type { StopReason } from "@/lib/ai/provider";

/** mode "answer": newline-delimited JSON, one event per line. */
export type AnswerStreamEvent =
  | { type: "intents"; ids: string[] }
  | { type: "text"; text: string }
  | { type: "done"; stopReason: StopReason }
  | { type: "error"; message: string };

/** mode "classify": a single JSON object. */
export type ClassifyResponse = Classification;
