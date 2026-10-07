import type { ClassificationEntry } from "@/lib/ai/classify";
import type { MachineType } from "@/lib/ontology";
import type { Control, Intent, JournalEntry, OutlineSection, Section, Suggestion, VocabularyEntry } from "@/lib/packs/schema";

/** The slice of a machine pack the chat screen needs (all of it is public). */
export type ChatPack = {
  id: string;
  brand: string;
  model: string;
  type: MachineType;
  version: string;
  status: "draft" | "published";
  /** Locked base, versioned in Git. */
  sections: Section[];
  intents: Intent[];
  suggestions: Suggestion[];
  journal: JournalEntry[];
  /** Shared-ontology structure: commands, planned sections, vocabulary (no values). */
  controls: Control[];
  outline: OutlineSection[];
  vocabulary: VocabularyEntry[];
};

export type MessageStatus =
  | "streaming"
  | "done"
  | "truncated" // cut off by the length limit
  | "refused" // the model declined to answer
  | "error";

export type ProposalState = "pending" | "sending" | "sent" | "cancelled";

export type ChatMessage = {
  id: string;
  author: "user" | "assistant";
  /**
   * answer: a reply from the model (part of the conversation history);
   * proposal: knowledge extracted from a contributor's message, to confirm;
   * notice: an app message (never sent back to the model).
   */
  kind: "answer" | "proposal" | "notice";
  text: string;
  intents: Intent[];
  status: MessageStatus;
  /** Shown instead of / under the text when status is "error". */
  error?: string;
  proposal?: { entries: ClassificationEntry[]; state: ProposalState; error?: string };
};
