"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useUser } from "@/components/auth/AuthProvider";
import { ActionButton, Chip, Tag } from "@/components/ui";
import { MACHINE_TYPES, type MachineType } from "@/lib/ontology";

const fieldClass = "w-full border-rule border-line bg-paper px-3 py-3 text-sm text-ink placeholder:text-muted";
const MAX_DESCRIPTION = 280;

export function NewMachineForm() {
  const user = useUser();
  const router = useRouter();
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [type, setType] = useState<MachineType>("roaster");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" } | { kind: "creating" } | { kind: "error"; message: string }>({
    kind: "idle",
  });

  const creating = status.kind === "creating";
  const canSubmit = brand.trim() && model.trim() && !creating;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus({ kind: "creating" });
    try {
      const response = await fetch("/api/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, model, type, description }),
      });
      const body = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!response.ok || !body?.id) {
        return setStatus({ kind: "error", message: body?.error ?? "La machine n'a pas pu être créée. Réessayez." });
      }
      router.push(`/m/${body.id}`);
    } catch {
      setStatus({ kind: "error", message: "Connexion perdue. Réessayez." });
    }
  }

  if (!user) {
    return (
      <p className="mt-8 border-rule border-line p-4 text-sm">
        Ajouter une machine demande un compte : vous en deviendrez le mainteneur.{" "}
        <Link href="/login?next=/machines/new" className="underline underline-offset-4">
          Se connecter
        </Link>
      </p>
    );
  }

  if (!user.username) {
    return (
      <p className="mt-8 border-rule border-line p-4 text-sm">
        Avant d&apos;ajouter une machine,{" "}
        <Link href="/compte?next=/machines/new" className="underline underline-offset-4">
          choisis ton nom d&apos;utilisateur
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-wider">Marque</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} required placeholder="Mahlkönig" className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs uppercase tracking-wider">Modèle</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} maxLength={60} required placeholder="EK43 S" className={fieldClass} />
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs uppercase tracking-wider">Type</legend>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {MACHINE_TYPES.map((t) => (
            <Chip key={t.id} role="radio" aria-checked={type === t.id} selected={type === t.id} onClick={() => setType(t.id)} className="px-4 py-2">
              {t.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-2 flex items-baseline justify-between text-xs uppercase tracking-wider">
          Description courte
          <span className="text-muted normal-case">
            {description.length}/{MAX_DESCRIPTION}
          </span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
          rows={3}
          placeholder="Moulin du labo, utilisé pour le filtre et les tests de cupping."
          className={`${fieldClass} resize-y`}
        />
      </label>

      <div className="border-l-rule border-line pl-3 text-xs leading-relaxed text-muted">
        L&apos;assistant prépare la <strong className="text-ink">structure</strong> de la base : commandes, sections et
        vocabulaire typiques de ce type de machine. Aucune valeur n&apos;est inventée : réglages, températures et limites
        viendront de vos contributions. Vous serez <strong className="text-ink">mainteneur</strong> de la machine.
      </div>

      {status.kind === "error" && (
        <p role="alert" className="border-l-rule border-line pl-3 text-sm">
          {status.message}
        </p>
      )}

      <ActionButton type="submit" block disabled={!canSubmit}>
        {creating ? "Préparation de la structure…" : "Créer la machine"}
      </ActionButton>
      {creating && (
        <p role="status" className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
          <Tag>
            <span className="animate-pulse">■</span>
          </Tag>
          Cela peut prendre jusqu&apos;à une minute.
        </p>
      )}
    </form>
  );
}
