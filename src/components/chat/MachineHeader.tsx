"use client";

import { Chip, Tag } from "@/components/ui";
import { ROLE_LABELS, type MemberRole } from "@/lib/roles";
import type { ChatPack } from "./types";

const STATUS_LABELS: Record<ChatPack["status"], string> = { draft: "Brouillon", published: "Publié" };

export function MachineHeader({
  pack,
  role,
  roleLoading,
  pendingReview,
  onOpenJournal,
}: {
  pack: ChatPack;
  role: MemberRole;
  roleLoading: boolean;
  /** Proposals waiting for this maintainer; 0 for everyone else. */
  pendingReview: number;
  onOpenJournal: () => void;
}) {
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
          <Tag aria-live="polite" className={roleLoading ? "opacity-40" : ""}>
            {ROLE_LABELS[role]}
          </Tag>
          <Chip
            onClick={onOpenJournal}
            aria-haspopup="dialog"
            aria-label={pendingReview ? `Journal, ${pendingReview} proposition(s) à valider` : "Journal"}
          >
            Journal
            {pendingReview > 0 && <span className="ml-2 bg-ink px-1.5 font-bold text-paper">{pendingReview}</span>}
          </Chip>
        </div>
      </div>
    </div>
  );
}
