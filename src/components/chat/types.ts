import type { Intent, JournalEntry, Suggestion } from "@/lib/packs/schema";

/** The serializable slice of a machine pack the chat screen needs. */
export type ChatPack = {
  id: string;
  brand: string;
  model: string;
  version: string;
  status: "draft" | "published";
  /** Section id → title, to label citations. Bodies stay on the server. */
  sectionTitles: Record<string, string>;
  intents: Intent[];
  suggestions: Suggestion[];
  journal: JournalEntry[];
};

export type MessageStatus =
  | "streaming"
  | "done"
  | "truncated" // cut off by the length limit
  | "refused" // the model declined to answer
  | "error";

export type ChatMessage = {
  id: string;
  author: "user" | "assistant";
  text: string;
  intents: Intent[];
  status: MessageStatus;
  /** Shown instead of / under the text when status is "error". */
  error?: string;
};
