import type { ReactNode } from "react";
import type { Contribution } from "@/hooks/useContributions";

const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(iso: string) {
  return dateTimeFormat.format(new Date(iso));
}

export function nameOf(names: Record<string, string>, id: string | null) {
  return (id && names[id]) || "Contributeur inconnu";
}

/** "Proposé par X · date / Validé par Y · date" */
export function Provenance({ row, names }: { row: Contribution; names: Record<string, string> }) {
  const reviewVerb = row.status === "rejected" ? "Rejeté" : "Validé";
  return (
    <p className="text-xs leading-relaxed text-muted">
      Proposé par {nameOf(names, row.proposed_by)} · {formatDateTime(row.created_at)}
      {row.reviewed_at && (
        <>
          <br />
          {reviewVerb} par {nameOf(names, row.reviewed_by)} · {formatDateTime(row.reviewed_at)}
        </>
      )}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-sm leading-relaxed text-muted">{children}</p>;
}
