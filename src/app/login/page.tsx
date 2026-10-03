import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Connexion — Roast Copilot" };

const ERRORS: Record<string, string> = {
  expired: "Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.",
  browser: "Ouvrez le lien dans le navigateur où vous l'avez demandé, ou demandez-en un nouveau ici.",
  link: "Ce lien de connexion n'est pas valide. Demandez-en un nouveau.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? (ERRORS[params.error] ?? ERRORS.link) : null;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-8">
      <h1 className="text-2xl font-bold uppercase">Connexion</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Un compte sert à proposer des contributions et à les valider. Pour lire et poser des questions, il
        n&apos;est pas nécessaire.
      </p>
      <LoginForm next={next} initialError={error} />
    </main>
  );
}
