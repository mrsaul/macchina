import type { z } from "zod";

// Provider-agnostic contract for the language model. Routes and UI depend on
// this file only — never on a vendor SDK (CLAUDE.md, principle 3).

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** How hard the model should think: classification is cheap, answers less so. */
export type Effort = "low" | "medium" | "high";

export type GenerateRequest = {
  system: string;
  messages: ChatTurn[];
  effort?: Effort;
  signal?: AbortSignal;
};

export type StopReason =
  | "end" // finished normally
  | "max_tokens" // cut off by the length limit
  | "refusal"; // the model declined (safety classifier)

export type GenerateEvent = { type: "text"; text: string } | { type: "done"; stopReason: StopReason };

export type JSONResult<T> = { ok: true; data: T } | { ok: false; reason: StopReason | "invalid" };

export interface LLMProvider {
  readonly name: string;
  /** Streams free text. */
  generate(request: GenerateRequest): AsyncIterable<GenerateEvent>;
  /** Returns an object matching `schema` (strict JSON), or why it could not. */
  generateJSON<T>(request: GenerateRequest & { schema: z.ZodType<T> }): Promise<JSONResult<T>>;
}

/** Provider cannot run (missing key, bad credentials): not a user error. */
export class AIUnavailableError extends Error {}

/** Provider is rate limiting us or temporarily down: worth retrying later. */
export class AIBusyError extends Error {}
