"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/components/auth/AuthProvider";
import { Tag } from "@/components/ui";
import { useContributions } from "@/hooks/useContributions";
import { useRole } from "@/hooks/useRole";
import { buildKnowledge } from "@/lib/knowledge";
import { Composer } from "./Composer";
import { JournalDialog, type JournalTab } from "./JournalDialog";
import { MachineHeader } from "./MachineHeader";
import { MessageList } from "./MessageList";
import type { ChatPack } from "./types";
import { useChat } from "./useChat";

export function ChatScreen({ pack }: { pack: ChatPack }) {
  const user = useUser();
  const { role, loading: roleLoading } = useRole(pack.id);
  const canContribute = role === "contributor" || role === "maintainer";
  const { messages, busy, send, confirmProposal, cancelProposal } = useChat(pack, { canContribute });
  const contributions = useContributions(pack.id);
  const [text, setText] = useState("");
  const [dictated, setDictated] = useState(false);
  const [journal, setJournal] = useState<{ open: boolean; tab: JournalTab; key: number }>({
    open: false,
    tab: "base",
    key: 0,
  });

  // One knowledge base for the Journal and for citation titles: locked pack
  // sections + approved contributions.
  const knowledge = useMemo(
    () =>
      buildKnowledge(
        pack.sections,
        contributions.rows
          .filter((r) => r.status === "approved")
          .map((r) => ({ id: r.id, section: r.section ?? "divers", text: r.text, safety: r.safety })),
      ),
    [pack.sections, contributions.rows],
  );
  const sectionTitles = useMemo(() => Object.fromEntries(knowledge.map((s) => [s.id, s.title])), [knowledge]);
  const pendingReview =
    role === "maintainer" ? contributions.rows.filter((r) => r.status === "proposed") : [];
  const mine = user
    ? contributions.rows.filter((r) => r.proposed_by === user.id).toReversed()
    : [];

  function openJournal() {
    // Remount on each open so the panel starts on the most useful tab.
    setJournal((j) => ({ open: true, tab: pendingReview.length ? "review" : "base", key: j.key + 1 }));
  }
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Follow new messages and the streaming answer, unless the reader scrolled up.
  const lastLength = messages.at(-1)?.text.length ?? 0;
  useEffect(() => {
    if (!messages.length) return;
    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240;
    if (nearBottom) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastLength]);

  function submit(question: string) {
    void send(question);
    setText("");
    setDictated(false);
  }

  // Suggestions fill the field rather than sending: same review step as dictation.
  function applySuggestion(suggestion: string) {
    setText(suggestion);
    setDictated(false);
    textareaRef.current?.focus();
  }

  return (
    <div className="flex flex-1 flex-col">
      <MachineHeader
        pack={pack}
        role={role}
        roleLoading={roleLoading}
        pendingReview={pendingReview.length}
        onOpenJournal={openJournal}
      />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-8">
        {messages.length === 0 ? (
          <section aria-labelledby="empty-title" className="space-y-6">
            <div>
              <h1 id="empty-title" className="text-xl font-bold uppercase leading-tight sm:text-2xl">
                Une question sur la {pack.model} ?
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Écrivez ou dictez votre question. Les réponses s&apos;appuient uniquement sur la base de la machine.
                {canContribute &&
                  " Vous pouvez aussi décrire ce que vous savez de la machine : ce sera proposé à la validation."}
              </p>
            </div>

            {pack.suggestions.length > 0 && (
              <div>
                <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Suggestions</h2>
                <ul className="flex flex-col gap-2">
                  {pack.suggestions.map((s) => {
                    const intent = pack.intents.find((i) => i.id === s.intent);
                    return (
                      <li key={s.text}>
                        <button
                          type="button"
                          onClick={() => applySuggestion(s.text)}
                          className="flex w-full flex-col items-start gap-2 border-rule border-line px-3 py-3 text-left text-sm hover:bg-panel sm:flex-row-reverse sm:justify-between sm:gap-3"
                        >
                          {intent && <Tag className="shrink-0">{intent.label}</Tag>}
                          <span>{s.text}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <MessageList
            messages={messages}
            assistantLabel={pack.model}
            sectionTitles={sectionTitles}
            onConfirmProposal={(id) => void confirmProposal(id)}
            onCancelProposal={cancelProposal}
          />
        )}
        <div ref={endRef} />
      </main>

      <Composer
        text={text}
        onTextChange={setText}
        dictated={dictated}
        onDictatedChange={setDictated}
        onSend={submit}
        busy={busy}
        textareaRef={textareaRef}
      />

      <JournalDialog
        key={journal.key}
        pack={pack}
        open={journal.open}
        onClose={() => setJournal((j) => ({ ...j, open: false }))}
        initialTab={journal.tab}
        role={role}
        knowledge={knowledge}
        sectionTitles={sectionTitles}
        contributions={contributions}
        pendingReview={pendingReview}
        mine={mine}
      />
    </div>
  );
}
