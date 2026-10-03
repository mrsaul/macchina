"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useUser } from "@/components/auth/AuthProvider";
import { ActionButton, Tag } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const user = useUser();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(initialError ? { kind: "error", message: initialError } : { kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    setStatus({ kind: "sending" });

    const redirect = new URL("/auth/callback", window.location.origin);
    redirect.searchParams.set("next", next);

    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: redirect.toString(), shouldCreateUser: true },
    });

    if (error) {
      setStatus({
        kind: "error",
        message:
          error.status === 429
            ? "Trop de demandes. Patientez quelques minutes avant de redemander un lien."
            : "Impossible d'envoyer le lien. Vérifiez l'adresse et réessayez.",
      });
    } else {
      setStatus({ kind: "sent", email: address });
    }
  }

  if (user) {
    return (
      <div className="mt-8 border-rule border-line bg-panel p-4 text-sm">
        <p>
          Connecté en tant que <strong>{user.email}</strong>.
        </p>
        <Link href={next} className="mt-4 inline-block underline underline-offset-4">
          Continuer
        </Link>
      </div>
    );
  }

  if (status.kind === "sent") {
    return (
      <div className="mt-8 border-rule border-line bg-panel" role="status">
        <div className="border-b-rule border-line px-4 py-2">
          <Tag>Lien envoyé</Tag>
        </div>
        <div className="space-y-3 p-4 text-sm leading-relaxed">
          <p>
            Un lien de connexion a été envoyé à <strong>{status.email}</strong>.
          </p>
          <p className="text-muted">Ouvrez-le dans ce navigateur. Pensez à vérifier les indésirables.</p>
          <button
            type="button"
            onClick={() => setStatus({ kind: "idle" })}
            className="text-xs uppercase tracking-wider underline underline-offset-4"
          >
            Utiliser une autre adresse
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-wider">Adresse e-mail</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.fr"
            className="w-full border-rule border-line bg-paper px-3 py-3 text-sm text-ink placeholder:text-muted"
          />
        </label>

        {status.kind === "error" && (
          <p role="alert" className="border-l-rule border-line pl-3 text-sm">
            {status.message}
          </p>
        )}

        <ActionButton type="submit" block disabled={status.kind === "sending"}>
          {status.kind === "sending" ? "Envoi…" : "Recevoir un lien de connexion"}
        </ActionButton>
      </form>

      <div className="mt-8 border-t-rule border-line pt-6">
        <Link href={next} className="text-xs uppercase tracking-wider underline underline-offset-4">
          Continuer sans compte (lecture seule)
        </Link>
      </div>
    </>
  );
}
