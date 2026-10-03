import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AIBusyError, AIUnavailableError, type AIProvider, type AnswerEvent, type AnswerStopReason } from "../provider";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

function mapStopReason(reason: string | null | undefined): AnswerStopReason {
  if (reason === "refusal") return "refusal";
  if (reason === "max_tokens" || reason === "model_context_window_exceeded") return "max_tokens";
  return "end";
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private client: Anthropic | null = null;

  private getClient() {
    if (!process.env.ANTHROPIC_API_KEY) throw new AIUnavailableError("ANTHROPIC_API_KEY manquante");
    this.client ??= new Anthropic();
    return this.client;
  }

  async *streamAnswer({ system, turns, signal }: Parameters<AIProvider["streamAnswer"]>[0]): AsyncIterable<AnswerEvent> {
    const client = this.getClient();

    try {
      const stream = client.beta.messages.stream(
        {
          model: MODEL,
          max_tokens: 16000,
          // Grounded Q&A over a small pack: medium effort (Opus 5.5's default, set explicitly).
          output_config: { effort: "medium" },
          // The system prompt carries the whole pack and is identical across a
          // conversation, so it is the cacheable prefix.
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: turns.map((t) => ({ role: t.role, content: t.content })),
          // If a safety classifier declines, the API retries on Anthropic's
          // recommended model for that category instead of failing outright.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal },
      );

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      yield { type: "done", stopReason: mapStopReason(final.stop_reason) };
    } catch (error) {
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
  }
}
