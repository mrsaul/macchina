import { Tag } from "@/components/ui";
import type { Contribution } from "@/hooks/useContributions";
import type { KnowledgeSection } from "@/lib/knowledge";
import { EmptyState, Provenance } from "./shared";

/** Locked pack sections + approved contributions, grouped by section. */
export function KnowledgeBase({
  knowledge,
  rowsById,
  names,
}: {
  knowledge: KnowledgeSection[];
  rowsById: Map<string, Contribution>;
  names: Record<string, string>;
}) {
  if (knowledge.length === 0) {
    return (
      <EmptyState>
        La base est encore vide. Elle se remplit avec le pack de référence et les contributions validées par les
        mainteneurs.
      </EmptyState>
    );
  }

  return (
    <div className="divide-y-[1.5px] divide-line">
      {knowledge.map((section) => (
        <section key={section.id} aria-labelledby={`kb-${section.id}`} className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`kb-${section.id}`} className="text-sm font-bold uppercase">
              {section.title}
            </h3>
            <span className="text-xs text-muted">§{section.id}</span>
            {section.safety && <Tag>Safety</Tag>}
          </div>

          {section.locked && (
            <div className="border-rule border-line p-3">
              <p className="mb-2 text-xs uppercase tracking-wider">
                <Tag>Base verrouillée</Tag> <span className="text-muted">pack v. Git</span>
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{section.locked.body}</p>
            </div>
          )}

          {section.approved.length > 0 && (
            <ul className="space-y-2">
              {section.approved.map((entry) => {
                const row = rowsById.get(entry.id);
                return (
                  <li key={entry.id} className="border-l-rule border-line pl-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {entry.text} {entry.safety && <Tag className="align-middle">Safety</Tag>}
                    </p>
                    {row && <Provenance row={row} names={names} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
