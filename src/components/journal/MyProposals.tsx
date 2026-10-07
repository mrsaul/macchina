import { Tag } from "@/components/ui";
import type { Contribution } from "@/hooks/useContributions";
import { humanizeSlug } from "@/lib/knowledge";
import { EmptyState, Provenance } from "./shared";

const STATUS_LABELS: Record<Contribution["status"], string> = {
  proposed: "En attente",
  approved: "Validée",
  rejected: "Rejetée",
};

export function MyProposals({
  rows,
  names,
  sectionTitles,
}: {
  rows: Contribution[];
  names: Record<string, string>;
  sectionTitles: Record<string, string>;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState>
        Vous n&apos;avez encore rien proposé. Décrivez une connaissance sur la machine dans le chat : elle vous sera
        présentée pour confirmation avant envoi.
      </EmptyState>
    );
  }

  return (
    <ol className="divide-y-[1.5px] divide-line">
      {rows.map((row) => (
        <li key={row.id} className="space-y-2 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider">
            <span className={row.status === "proposed" ? "border-rule border-line px-2 py-0.5" : "bg-ink px-2 py-0.5 font-bold text-paper"}>
              {STATUS_LABELS[row.status]}
            </span>
            <span className="text-muted" title={`§${row.section}`}>
              {sectionTitles[row.section ?? ""] ?? humanizeSlug(row.section ?? "divers")}
            </span>
            {row.safety && <Tag>Safety</Tag>}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{row.text}</p>
          {row.status === "rejected" && row.reason && (
            <p className="border-l-rule border-line pl-3 text-sm">
              <span className="text-xs uppercase tracking-wider text-muted">Motif du rejet : </span>
              {row.reason}
            </p>
          )}
          <Provenance row={row} names={names} />
        </li>
      ))}
    </ol>
  );
}
