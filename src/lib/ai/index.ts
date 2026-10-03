import "server-only";
import type { AIProvider } from "./provider";
import { AnthropicProvider } from "./providers/anthropic";

// Add a provider: implement AIProvider in ./providers/ and register it here.
// Selected with AI_PROVIDER (default: anthropic).
const PROVIDERS: Record<string, () => AIProvider> = {
  anthropic: () => new AnthropicProvider(),
};

let instance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (instance) return instance;
  const name = process.env.AI_PROVIDER || "anthropic";
  const factory = PROVIDERS[name];
  if (!factory) throw new Error(`AI_PROVIDER inconnu : "${name}"`);
  instance = factory();
  return instance;
}

export * from "./provider";
