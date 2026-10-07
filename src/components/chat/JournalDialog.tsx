"use client";

import { useEffect, useRef, useState } from "react";
import { KnowledgeBase } from "@/components/journal/KnowledgeBase";
import { MyProposals } from "@/components/journal/MyProposals";
import { ReviewQueue } from "@/components/journal/ReviewQueue";
import { EmptyState } from "@/components/journal/shared";
import { Chip, Tag } from "@/components/ui";
import type { Contribution } from "@/hooks/useContributions";
import type { KnowledgeSection } from "@/lib/knowledge";
import type { MemberRole } from "@/lib/roles";
import type { ChatPack } from "./types";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export type JournalTab = "base" | "review" | "mine" | "versions";

type JournalDialogProps = {
  pack: ChatPack;
  open: boolean;
  onClose: () => void;
  initialTab: JournalTab;
  role: MemberRole;
  knowledge: KnowledgeSection[];
  sectionTitles: Record<string, string>;
  contributions: {
    rows: Contribution[];
    names: Record<string, string>;
    loading: boolean;
    error: string | null;
    reload: () => void;
  };
  pendingReview: Contribution[];
  mine: Contribution[];
};

/** Knowledge base, review queue and pack history, in a side panel (full screen on mobile). */
export function JournalDialog({
  pack,
  open,
  onClose,
  initialTab,
  role,
  knowledge,
  sectionTitles,
  contributions,
  pendingReview,
  mine,
}: JournalDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<JournalTab>(initialTab);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const isMaintainer = role === "maintainer";
  const canContribute = role === "contributor" || isMaintainer;
  const tabs: { id: JournalTab; label: string; count?: number }[] = [
    { id: "base", label: "Base" },
    ...(isMaintainer ? [{ id: "review" as const, label: "À valider", count: pendingReview.length }] : []),
    ...(canContribute || mine.length ? [{ id: "mine" as const, label: "Mes propositions", count: mine.length }] : []),
    { id: "versions", label: "Versions" },
  ];
  // A tab can disappear (role change): fall back to the base.
  const current = tabs.some((t) => t.id === tab) ? tab : "base";
  const rowsById = new Map(contributions.rows.map((r) => [r.id, r]));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()} // backdrop click
      aria-labelledby="journal-title"
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-lg overflow-y-auto border-l-rule border-line bg-paper p-0 text-ink backdrop:bg-[#15140f]/60"
    >
      <div className="sticky top-0 z-10 border-b-rule border-line bg-paper">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Tag>{pack.model}</Tag>
            <h2 id="journal-title" className="text-sm font-bold uppercase tracking-wider">
              Journal
            </h2>
          </div>
          <Chip onClick={onClose}>Fermer</Chip>
        </div>
        <div role="tablist" aria-label="Sections du journal" className="flex flex-wrap gap-2 px-4 pb-3">
          {tabs.map((t) => (
            <Chip
              key={t.id}
              role="tab"
              aria-selected={current === t.id}
              aria-controls={`journal-panel-${t.id}`}
              selected={current === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.count ? ` · ${t.count}` : ""}
            </Chip>
          ))}
        </div>
      </div>

      <div id={`journal-panel-${current}`} role="tabpanel">
        {contributions.error && (
          <p role="alert" className="mx-4 mt-4 border-l-rule border-line pl-3 text-sm">
            {contributions.error}
          </p>
        )}
        {contributions.loading && current !== "versions" ? (
          <EmptyState>Chargement…</EmptyState>
        ) : current === "base" ? (
          <KnowledgeBase knowledge={knowledge} rowsById={rowsById} names={contributions.names} />
        ) : current === "review" ? (
          <ReviewQueue
            rows={pendingReview}
            names={contributions.names}
            sectionTitles={sectionTitles}
            onChanged={contributions.reload}
          />
        ) : current === "mine" ? (
          <MyProposals rows={mine} names={contributions.names} sectionTitles={sectionTitles} />
        ) : pack.journal.length === 0 ? (
          <EmptyState>Aucune version pour l&apos;instant.</EmptyState>
        ) : (
          <ol className="divide-y-[1.5px] divide-line">
            {pack.journal.map((entry) => (
              <li key={`${entry.date}-${entry.version}-${entry.title}`} className="space-y-2 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider">
                  <time dateTime={entry.date} className="text-muted">
                    {dateFormat.format(new Date(entry.date))}
                  </time>
                  <Tag>v{entry.version}</Tag>
                  {entry.safety && <Tag>Safety</Tag>}
                </div>
                <h3 className="text-sm font-bold uppercase">{entry.title}</h3>
                {entry.body && <p className="text-sm leading-relaxed text-muted">{entry.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}
