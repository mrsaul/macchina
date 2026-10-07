import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import {
  AIBusyError,
  AIUnavailableError,
  type GenerateEvent,
  type GenerateRequest,
  type JSONResult,
  type LLMProvider,
  type StopReason,
} from "../provider";
import { toStructuredOutputSchema } from "./anthropic-schema";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";


function mapStopReason(reason: string | null | undefined): StopReason {
  if (reason === "refusal") return "refusal";
  if (reason === "max_tokens" || reason === "model_context_window_exceeded") return "max_tokens";
  return "end";
}

/** Maps SDK errors onto the provider-agnostic ones; rethrows the rest. */
function translateError(error: unknown): never {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    throw new AIUnavailableError("Clé Anthropic refusée");
  }
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    throw new AIBusyError(error.message);
  }
  throw error;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic | null = null;

  private getClient() {
    if (!process.env.ANTHROPIC_API_KEY) throw new AIUnavailableError("ANTHROPIC_API_KEY manquante");
    this.client ??= new Anthropic();
    return this.client;
  }

  private baseParams({ system, messages, effort = "medium" }: GenerateRequest) {
    return {
      model: MODEL,
      output_config: { effort },
      // The system prompt is identical across a conversation: the cacheable prefix.
      system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      // If a safety classifier declines, the API retries on Anthropic's
      // recommended model for that category instead of failing outright.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default" as const,
    };
  }

  async *generate(request: GenerateRequest): AsyncIterable<GenerateEvent> {
    const client = this.getClient();
    try {
      const stream = client.beta.messages.stream(
        { ...this.baseParams(request), max_tokens: 16000 },
        { signal: request.signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      yield { type: "done", stopReason: mapStopReason(final.stop_reason) };
    } catch (error) {
      translateError(error);
    }
  }

  async generateJSON<T>(request: GenerateRequest & { schema: z.ZodType<T> }): Promise<JSONResult<T>> {
    const client = this.getClient();
    try {
      const base = this.baseParams(request);
      const response = await client.beta.messages.create(
        {
          ...base,
          max_tokens: 16000,
          // Structured outputs: the API constrains generation to the schema.
          output_config: {
            ...base.output_config,
            format: { type: "json_schema", schema: toStructuredOutputSchema(request.schema) },
          },
        },
        { signal: request.signal },
      );
      const stopReason = mapStopReason(response.stop_reason);
      // A refusal or truncation may not match the schema: report, don't parse.
      if (stopReason !== "end") return { ok: false, reason: stopReason };

      const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return { ok: false, reason: "invalid" };
      }
      // Zod re-checks everything, including constraints the API cannot enforce.
      const parsed = request.schema.safeParse(json);
      return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "invalid" };
    } catch (error) {
      translateError(error);
    }
  }
}
