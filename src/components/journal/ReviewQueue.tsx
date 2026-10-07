"use client";

import { useState } from "react";
import { ActionButton, Chip, Tag } from "@/components/ui";
import type { Contribution } from "@/hooks/useContributions";
import { humanizeSlug } from "@/lib/knowledge";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, Provenance } from "./shared";

const fieldClass = "w-full border-rule border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted";

/** One proposal under review: edit, approve, or reject with a reason. */
function ReviewItem({
  row,
  names,
  sectionTitle,
  onDone,
}: {
  row: Contribution;
  names: Record<string, string>;
  sectionTitle: string;
  onDone: () => void;
}) {
  const [text, setText] = useState(row.text);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [safetyChecked, setSafetyChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edited = text.trim() !== row.text;
  const canApprove = text.trim().length > 0 && (!row.safety || safetyChecked) && !busy;

  async function review(change: { status: "approved" | "rejected"; text?: string; reason?: string }) {
    setBusy(true);
    setError(null);
    // reviewed_by / reviewed_at are set by a database trigger, not by the client.
    const { data, error } = await createClient().from("contributions").update(change).eq("id", row.id).select("id");
    setBusy(false);
    // RLS filters silently: zero rows means the update was not allowed.
    if (error || !data?.length) return setError("Action refusée. Vérifiez que vous êtes toujours mainteneur.");
    onDone();
  }

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider">
        <span className="border-rule border-line px-2 py-0.5" title={`§${row.section}`}>
          {sectionTitle}
        </span>
        {row.safety && <Tag>Safety</Tag>}
        {edited && <Tag>Modifié</Tag>}
      </div>

      <label className="block">
        <span className="sr-only">Texte de la contribution</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className={`${fieldClass} field-sizing-content min-h-20 resize-y`}
        />
      </label>
      <Provenance row={row} names={names} />

      {row.safety && !rejecting && (
        <label className="flex items-start gap-2 border-rule border-line p-3 text-xs uppercase leading-relaxed tracking-wider">
          <input
            type="checkbox"
            checked={safetyChecked}
            onChange={(e) => setSafetyChecked(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--ink)]"
          />
          <span>Contenu sécurité : j&apos;ai vérifié cette information avec une source fiable (manuel, constructeur).</span>
        </label>
      )}

      {rejecting && (
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider">Motif du rejet (visible par l&apos;auteur)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Ex. : information non vérifiable, doublon de §prechauffage…"
            className={`${fieldClass} resize-y`}
          />
        </label>
      )}

      {error && (
        <p role="alert" className="border-l-rule border-line pl-3 text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {rejecting ? (
          <>
            <ActionButton
              onClick={() => review({ status: "rejected", reason: reason.trim() })}
              disabled={!reason.trim() || busy}
            >
              {busy ? "…" : "Confirmer le rejet"}
            </ActionButton>
            <Chip onClick={() => setRejecting(false)} disabled={busy}>
              Retour
            </Chip>
          </>
        ) : (
          <>
            <ActionButton
              onClick={() => review({ status: "approved", ...(edited ? { text: text.trim() } : {}) })}
              disabled={!canApprove}
              title={row.safety && !safetyChecked ? "Cochez la vérification sécurité pour valider" : undefined}
            >
              {busy ? "…" : edited ? "Valider la version modifiée" : "Valider"}
            </ActionButton>
            <Chip onClick={() => setRejecting(true)} disabled={busy}>
              Rejeter
            </Chip>
          </>
        )}
      </div>
    </li>
  );
}

export function ReviewQueue({
  rows,
  names,
  sectionTitles,
  onChanged,
}: {
  rows: Contribution[];
  names: Record<string, string>;
  sectionTitles: Record<string, string>;
  onChanged: () => void;
}) {
  if (rows.length === 0) return <EmptyState>Rien à valider pour l&apos;instant.</EmptyState>;
  return (
    <ol className="divide-y-[1.5px] divide-line">
      {rows.map((row) => (
        <ReviewItem
          key={row.id}
          row={row}
          names={names}
          sectionTitle={sectionTitles[row.section ?? ""] ?? humanizeSlug(row.section ?? "divers")}
          onDone={onChanged}
        />
      ))}
    </ol>
  );
}
