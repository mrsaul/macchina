"use client";

import { useEffect, useRef } from "react";
import { Chip, Tag } from "@/components/ui";
import type { ChatPack } from "./types";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** Pack change log, in a side panel (full screen on mobile). */
export function JournalDialog({ pack, open, onClose }: { pack: ChatPack; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()} // backdrop click
      aria-labelledby="journal-title"
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-md overflow-y-auto border-l-rule border-line bg-paper p-0 text-ink backdrop:bg-ink/50"
    >
      <div className="sticky top-0 flex items-center justify-between border-b-rule border-line bg-paper px-4 py-3">
        <div className="flex items-center gap-2">
          <Tag>{pack.model}</Tag>
          <h2 id="journal-title" className="text-sm font-bold uppercase tracking-wider">
            Journal du pack
          </h2>
        </div>
        <Chip onClick={onClose}>Fermer</Chip>
      </div>

      {pack.journal.length === 0 ? (
        <p className="p-4 text-sm text-muted">Aucune entrée pour l&apos;instant.</p>
      ) : (
        <ol className="divide-y divide-line">
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
    </dialog>
  );
}
