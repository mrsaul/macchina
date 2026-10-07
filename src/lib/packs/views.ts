import type { ChatPack } from "@/components/chat/types";
import type { MachinePack } from "./schema";

/** The public slice of a pack the chat screen needs. */
export function toChatPack(pack: MachinePack): ChatPack {
  return {
    id: pack.id,
    brand: pack.brand,
    model: pack.model,
    type: pack.type,
    version: pack.version,
    status: pack.status,
    sections: pack.sections,
    intents: pack.intents,
    suggestions: pack.suggestions,
    journal: pack.journal,
    controls: pack.controls,
    outline: pack.outline,
    vocabulary: pack.vocabulary,
  };
}
