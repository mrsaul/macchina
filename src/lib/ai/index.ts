import "server-only";
import type { LLMProvider } from "./provider";
import { AnthropicProvider } from "./providers/anthropic";

// Add a provider: implement LLMProvider in ./providers/ and register it here.
// Selected with AI_PROVIDER (default: anthropic).
const PROVIDERS: Record<string, () => LLMProvider> = {
  anthropic: () => new AnthropicProvider(),
};

let instance: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (instance) return instance;
  const name = process.env.AI_PROVIDER || "anthropic";
  const factory = PROVIDERS[name];
  if (!factory) throw new Error(`AI_PROVIDER inconnu : "${name}"`);
  instance = factory();
  return instance;
}

export * from "./provider";
