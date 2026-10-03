import type { AnswerStopReason } from "@/lib/ai/provider";

/** Wire format of POST /api/chat: newline-delimited JSON, one event per line. */
export type ChatStreamEvent =
  | { type: "intents"; ids: string[] }
  | { type: "text"; text: string }
  | { type: "done"; stopReason: AnswerStopReason }
  | { type: "error"; message: string };
