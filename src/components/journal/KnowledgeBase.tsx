import { Tag } from "@/components/ui";
import type { Contribution } from "@/hooks/useContributions";
import type { KnowledgeSection } from "@/lib/knowledge";
import type { Control, OutlineSection, VocabularyEntry } from "@/lib/packs/schema";
import { EmptyState, Provenance } from "./shared";

/** Planned sections still empty, plus the machine's commands and vocabulary. */
function Structure({
  knowledge,
  outline,
  controls,
  vocabulary,
}: {
  knowledge: KnowledgeSection[];
  outline: OutlineSection[];
  controls: Control[];
  vocabulary: VocabularyEntry[];
}) {
  const filled = new Set(knowledge.map((s) => s.id));
  const todo = outline.filter((s) => !filled.has(s.id));
  if (!todo.length && !controls.length && !vocabulary.length) return null;

  return (
    <div className="space-y-3 border-t-rule border-line px-4 py-4">
      {todo.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest">Sections à compléter</h3>
          <ul className="space-y-1.5">
            {todo.map((s) => (
              <li key={s.id} className="border-l-rule border-line pl-3 text-sm">
                <span className="font-bold uppercase">{s.title}</span>{" "}
                <span className="text-xs text-muted">§{s.id}</span>
                {s.description && <span className="block text-xs leading-relaxed text-muted">{s.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {controls.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest">
            Commandes de la machine · {controls.length}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {controls.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-bold">{c.label}</span>
                {c.unit && <span className="text-xs text-muted"> ({c.unit})</span>}
                {c.description && <span className="block text-xs leading-relaxed text-muted">{c.description}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {vocabulary.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest">
            Vocabulaire · {vocabulary.length}
          </summary>
          <dl className="mt-2 space-y-1.5 text-sm">
            {vocabulary.map((v) => (
              <div key={v.term}>
                <dt className="inline font-bold">{v.term}</dt> <dd className="inline text-muted">— {v.definition}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

/** Locked pack sections + approved contributions, grouped by section. */
export function KnowledgeBase({
  knowledge,
  rowsById,
  names,
  outline,
  controls,
  vocabulary,
}: {
  knowledge: KnowledgeSection[];
  rowsById: Map<string, Contribution>;
  names: Record<string, string>;
  outline: OutlineSection[];
  controls: Control[];
  vocabulary: VocabularyEntry[];
}) {
  const structure = <Structure knowledge={knowledge} outline={outline} controls={controls} vocabulary={vocabulary} />;
  if (knowledge.length === 0) {
    return (
      <>
        <EmptyState>
          La base est encore vide. Elle se remplit avec le pack de référence et les contributions validées par les
          mainteneurs.
        </EmptyState>
        {structure}
      </>
    );
  }

  return (
    <>
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
      {structure}
    </>
  );
}
