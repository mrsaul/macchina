import { notFound } from "next/navigation";
import { ChatScreen } from "@/components/chat/ChatScreen";
import { DEFAULT_MACHINE_ID } from "@/lib/machines";
import { getPack } from "@/lib/packs";
import { toChatPack } from "@/lib/packs/views";

export default async function Home() {
  const pack = await getPack(DEFAULT_MACHINE_ID);
  if (!pack) notFound();
  return <ChatScreen pack={toChatPack(pack)} />;
}
