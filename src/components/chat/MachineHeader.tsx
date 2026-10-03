"use client";

import { Chip, Tag } from "@/components/ui";
import { useRole } from "@/hooks/useRole";
import { ROLE_LABELS } from "@/lib/roles";
import type { ChatPack } from "./types";

const STATUS_LABELS: Record<ChatPack["status"], string> = { draft: "Brouillon", published: "Publié" };

export function MachineHeader({ pack, onOpenJournal }: { pack: ChatPack; onOpenJournal: () => void }) {
  const { role, loading } = useRole(pack.id);

  return (
    <div className="border-b-rule border-line">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Tag className="text-sm">{pack.model}</Tag>
          <p className="truncate text-xs uppercase tracking-wider text-muted">
            {pack.brand} · Pack v{pack.version} · {STATUS_LABELS[pack.status]}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted">Rôle</span>
          <Tag aria-live="polite" className={loading ? "opacity-40" : ""}>
            {ROLE_LABELS[role]}
          </Tag>
          <Chip onClick={onOpenJournal} aria-haspopup="dialog">
            Journal
          </Chip>
        </div>
      </div>
    </div>
  );
}
