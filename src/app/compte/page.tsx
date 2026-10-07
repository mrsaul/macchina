import type { Metadata } from "next";
import { UsernameForm } from "@/components/auth/UsernameForm";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Compte — Roast Copilot" };

export default async function AccountPage({ searchParams }: PageProps<"/compte">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : null;
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-8">
      <h1 className="text-2xl font-bold uppercase">Compte</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Ton nom d&apos;utilisateur apparaît comme source de tes contributions et dans le Journal.
      </p>
      <UsernameForm next={next} />
    </main>
  );
}
