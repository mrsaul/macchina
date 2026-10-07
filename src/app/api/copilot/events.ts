import type { Classification } from "@/lib/ai/classify";
import type { StopReason } from "@/lib/ai/provider";
import type { AnswerSource } from "@/lib/knowledge";

/** mode "answer": newline-delimited JSON, one event per line. */
export type AnswerStreamEvent =
  | { type: "intents"; ids: string[] }
  | { type: "text"; text: string }
  /** Distinct sources of the entries the model declared using (sent before "done"). */
  | { type: "sources"; sources: AnswerSource[] }
  | { type: "done"; stopReason: StopReason }
  | { type: "error"; message: string };

/** mode "classify": a single JSON object. */
export type ClassifyResponse = Classification;
