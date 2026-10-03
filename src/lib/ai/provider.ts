// Provider-agnostic contract for the assistant. Routes and UI depend on this
// file only — never on a vendor SDK (CLAUDE.md, principle 3).

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AnswerStopReason =
  | "end" // finished normally
  | "max_tokens" // cut off by the length limit
  | "refusal"; // the model declined (safety classifier)

export type AnswerEvent = { type: "text"; text: string } | { type: "done"; stopReason: AnswerStopReason };

export interface AIProvider {
  readonly name: string;
  /** Streams an answer. Throws AIUnavailableError when misconfigured. */
  streamAnswer(input: { system: string; turns: ChatTurn[]; signal?: AbortSignal }): AsyncIterable<AnswerEvent>;
}

/** Provider cannot run (missing key, bad credentials): not a user error. */
export class AIUnavailableError extends Error {}

/** Provider is rate limiting us or temporarily down: worth retrying later. */
export class AIBusyError extends Error {}
