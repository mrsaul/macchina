import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NarrationScreen } from "@/components/narration/NarrationScreen";
import { getPack } from "@/lib/packs";

export const metadata: Metadata = { title: "Narration live — Roast Copilot" };

export default async function MachineNarrationPage({ params }: PageProps<"/m/[machineId]/narration">) {
  const pack = await getPack((await params).machineId);
  // Live narration reads roast curves: roasters only.
  if (!pack || pack.type !== "roaster") notFound();
  return (
    <NarrationScreen
      pack={{ id: pack.id, brand: pack.brand, model: pack.model, version: pack.version, limits: pack.limits }}
    />
  );
}
