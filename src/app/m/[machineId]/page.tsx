import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatScreen } from "@/components/chat/ChatScreen";
import { getPack } from "@/lib/packs";
import { toChatPack } from "@/lib/packs/views";

export async function generateMetadata({ params }: PageProps<"/m/[machineId]">): Promise<Metadata> {
  const pack = await getPack((await params).machineId);
  return { title: pack ? `${pack.brand} ${pack.model} — Roast Copilot` : "Machine introuvable — Roast Copilot" };
}

export default async function MachinePage({ params }: PageProps<"/m/[machineId]">) {
  const pack = await getPack((await params).machineId);
  if (!pack) notFound();
  return <ChatScreen pack={toChatPack(pack)} />;
}
