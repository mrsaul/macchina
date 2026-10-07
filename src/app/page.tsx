import { notFound } from "next/navigation";
import { ChatScreen } from "@/components/chat/ChatScreen";
import type { ChatPack } from "@/components/chat/types";
import { DEFAULT_MACHINE_ID } from "@/lib/machines";
import { getPack } from "@/lib/packs";

export default function Home() {
  const pack = getPack(DEFAULT_MACHINE_ID);
  if (!pack) notFound();

  // Everything here is public knowledge; the pack's raw file stays server-side.
  const chatPack: ChatPack = {
    id: pack.id,
    brand: pack.brand,
    model: pack.model,
    version: pack.version,
    status: pack.status,
    sections: pack.sections,
    intents: pack.intents,
    suggestions: pack.suggestions,
    journal: pack.journal,
  };

  return <ChatScreen pack={chatPack} />;
}
