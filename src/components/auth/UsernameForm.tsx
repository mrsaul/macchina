"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSetUsername, useUser } from "@/components/auth/AuthProvider";
import { ActionButton, Tag } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

// Mirrors the database check (profiles.username_format).
const USERNAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9]([A-Za-zÀ-ÖØ-öø-ÿ0-9 ._-]{0,28}[A-Za-zÀ-ÖØ-öø-ÿ0-9])?$/;

export function UsernameForm({ next }: { next: string | null }) {
  const user = useUser();
  const setUsernameEverywhere = useSetUsername();
  const router = useRouter();
  const [value, setValue] = useState(user?.username ?? "");
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" } | { kind: "error"; message: string }>({
    kind: "idle",
  });

  if (!user) {
    return (
      <p className="mt-8 border-rule border-line p-4 text-sm">
        <Link href="/login?next=/compte" className="underline underline-offset-4">
          Connectez-vous
        </Link>{" "}
        pour gérer votre compte.
      </p>
    );
  }

  const trimmed = value.trim();
  const valid = USERNAME_RE.test(trimmed);
  const unchanged = trimmed === user.username;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid || unchanged || !user) return;
    setStatus({ kind: "saving" });
    const { data, error } = await createClient()
      .from("profiles")
      .update({ username: trimmed })
      .eq("id", user.id)
      .select("username");
    if (error) {
      return setStatus({
        kind: "error",
        message:
          error.code === "23505"
            ? "Ce nom d'utilisateur est déjà pris."
            : error.code === "23514"
              ? "Format invalide."
              : "L'enregistrement a échoué. Réessayez.",
      });
    }
    if (!data?.length) return setStatus({ kind: "error", message: "L'enregistrement a échoué. Reconnectez-vous." });
    setUsernameEverywhere(trimmed);
    setStatus({ kind: "saved" });
    if (next) router.push(next);
    else router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      {!user.username && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider">
          <Tag>Requis</Tag>
          <span className="text-muted">Choisis ton nom d&apos;utilisateur pour contribuer.</span>
        </p>
      )}
      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-wider">Nom d&apos;utilisateur</span>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus({ kind: "idle" });
          }}
          maxLength={30}
          autoComplete="nickname"
          placeholder="Saul"
          className="w-full border-rule border-line bg-paper px-3 py-3 text-sm text-ink placeholder:text-muted"
        />
      </label>
      <p className="text-xs leading-relaxed text-muted">
        2 à 30 caractères : lettres (accents compris), chiffres, espaces, points, tirets. Visible par tous comme source
        de tes contributions (« Sources : {trimmed || "Saul"} »).
      </p>
      {trimmed && !valid && (
        <p role="alert" className="border-l-rule border-line pl-3 text-sm">
          Doit commencer et finir par une lettre ou un chiffre.
        </p>
      )}
      {status.kind === "error" && (
        <p role="alert" className="border-l-rule border-line pl-3 text-sm">
          {status.message}
        </p>
      )}
      {status.kind === "saved" && (
        <p role="status" className="text-xs uppercase tracking-wider">
          <Tag>Enregistré</Tag>
        </p>
      )}
      <ActionButton type="submit" block disabled={!valid || unchanged || status.kind === "saving"}>
        {status.kind === "saving" ? "Enregistrement…" : "Enregistrer"}
      </ActionButton>
      <p className="text-xs text-muted">Compte : {user.email}</p>
    </form>
  );
}
