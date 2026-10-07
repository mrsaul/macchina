import type { Metadata } from "next";
import { NewMachineForm } from "@/components/machines/NewMachineForm";

export const metadata: Metadata = { title: "Ajouter une machine — Roast Copilot" };

export default function NewMachinePage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-12 sm:px-8">
      <h1 className="text-2xl font-bold uppercase">Ajouter une machine</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Torréfacteur, moulin, machine espresso : chaque machine a sa propre base de connaissances et son copilote.
      </p>
      <NewMachineForm />
    </main>
  );
}
