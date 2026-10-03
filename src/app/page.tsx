import { notFound } from "next/navigation";
import { ChatScreen } from "@/components/chat/ChatScreen";
import type { ChatPack } from "@/components/chat/types";
import { DEFAULT_MACHINE_ID } from "@/lib/machines";
import { getPack } from "@/lib/packs";

export default function Home() {
  const pack = getPack(DEFAULT_MACHINE_ID);
  if (!pack) notFound();

  // Only what the client needs: section bodies stay on the server.
  const chatPack: ChatPack = {
    id: pack.id,
    brand: pack.brand,
    model: pack.model,
    version: pack.version,
    status: pack.status,
    sectionTitles: Object.fromEntries(pack.sections.map((s) => [s.id, s.title])),
    intents: pack.intents,
    suggestions: pack.suggestions,
    journal: pack.journal,
  };

  return <ChatScreen pack={chatPack} />;
}
