"use client";

import { useState } from "react";
import { humanizeSlug } from "@/lib/knowledge";
import { ActionButton, Chip, Tag } from "@/components/ui";
import type { ChatMessage, ProposalSource } from "./types";

const SOURCE_CHOICES = [
  { id: "self", label: "Moi" },
  { id: "contributor", label: "Une autre personne" },
  { id: "manual", label: "Un manuel" },
  { id: "document", label: "Un document" },
] as const;
type SourceChoice = (typeof SOURCE_CHOICES)[number]["id"];

const SOURCE_PLACEHOLDER: Record<Exclude<SourceChoice, "self">, string> = {
  contributor: "Nom de la personne (ex. Aude)",
  manual: "Titre du manuel (ex. Manuel du moulin)",
  document: "Titre du document",
};

type Proposal = NonNullable<ChatMessage["proposal"]>;

/**
 * Knowledge extracted from a contributor's message. Nothing is saved until
 * the contributor confirms; then each entry becomes a "proposed" row that a
 * maintainer reviews in the Journal.
 */
export function ProposalCard({
  label,
  proposal,
  sectionTitles,
  onConfirm,
  onCancel,
}: {
  label: string;
  proposal: Proposal;
  sectionTitles: Record<string, string>;
  onConfirm: (source: ProposalSource) => void;
  onCancel: () => void;
}) {
  const { entries, state, error } = proposal;
  const count = entries.length;
  const [choice, setChoice] = useState<SourceChoice>("self");
  const [sourceLabel, setSourceLabel] = useState("");
  const needsLabel = choice !== "self";
  const source: ProposalSource =
    choice === "self" ? { type: "self" } : { type: choice, label: sourceLabel };

  return (
    <article className="border-rule border-line bg-panel" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 border-b-rule border-line px-4 py-2">
        <span className="text-xs font-bold uppercase tracking-widest">{label}</span>
        <Tag>Proposition</Tag>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-sm leading-relaxed">
          {count > 1 ? `J'ai relevé ${count} informations` : "J'ai relevé une information"} à ajouter à la base.
          {state === "pending" && " Vérifiez avant d'envoyer : un mainteneur les validera."}
        </p>

        <ol className="space-y-2">
          {entries.map((entry, i) => (
            <li key={i} className={`border-rule border-line bg-paper p-3 ${state === "cancelled" ? "opacity-40" : ""}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider">
                <span className="border-rule border-line px-2 py-0.5" title={`§${entry.section}`}>
                  {sectionTitles[entry.section] ?? humanizeSlug(entry.section)}
                </span>
                {entry.safety && <Tag>Safety</Tag>}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{entry.text}</p>
            </li>
          ))}
        </ol>

        {entries.some((e) => e.safety) && state !== "cancelled" && (
          <p role="note" className="border-rule border-line px-3 py-2 text-xs uppercase leading-relaxed tracking-wider">
            ⚠ Contenu sécurité — il ne sera visible qu&apos;après vérification par un mainteneur.
          </p>
        )}

        {error && (
          <p role="alert" className="border-l-rule border-line pl-3 text-sm">
            {error}
          </p>
        )}

        {(state === "pending" || state === "sending") && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs uppercase tracking-wider">D&apos;où vient cette information ?</legend>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {SOURCE_CHOICES.map((c) => (
                <Chip
                  key={c.id}
                  role="radio"
                  aria-checked={choice === c.id}
                  selected={choice === c.id}
                  onClick={() => setChoice(c.id)}
                  disabled={state === "sending"}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
            {needsLabel && (
              <input
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                maxLength={80}
                placeholder={SOURCE_PLACEHOLDER[choice]}
                aria-label="Source"
                className="w-full border-rule border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted"
              />
            )}
          </fieldset>
        )}

        {(state === "pending" || state === "sending") && (
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => onConfirm(source)} disabled={state === "sending" || (needsLabel && !sourceLabel.trim())}>
              {state === "sending" ? "Envoi…" : "Proposer à la validation"}
            </ActionButton>
            <Chip onClick={onCancel} disabled={state === "sending"} className="px-4">
              Annuler
            </Chip>
          </div>
        )}
        {state === "sent" && (
          <p role="status" className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider">
            <Tag>Envoyé</Tag>
            <span className="text-muted">En attente de validation — suivez-la dans Journal › Mes propositions.</span>
          </p>
        )}
        {state === "cancelled" && <p className="text-xs uppercase tracking-wider text-muted">Proposition annulée</p>}
      </div>
    </article>
  );
}
