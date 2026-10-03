"use client";

import { useEffect, useRef, useState } from "react";
import { Tag } from "@/components/ui";
import { Composer } from "./Composer";
import { JournalDialog } from "./JournalDialog";
import { MachineHeader } from "./MachineHeader";
import { MessageList } from "./MessageList";
import type { ChatPack } from "./types";
import { useChat } from "./useChat";

export function ChatScreen({ pack }: { pack: ChatPack }) {
  const { messages, busy, send } = useChat(pack);
  const [text, setText] = useState("");
  const [dictated, setDictated] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
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
      <MachineHeader pack={pack} onOpenJournal={() => setJournalOpen(true)} />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-8">
        {messages.length === 0 ? (
          <section aria-labelledby="empty-title" className="space-y-6">
            <div>
              <h1 id="empty-title" className="text-xl font-bold uppercase leading-tight sm:text-2xl">
                Une question sur la {pack.model} ?
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Écrivez ou dictez votre question. Les réponses s&apos;appuient uniquement sur le pack de la machine.
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
          <MessageList messages={messages} assistantLabel={pack.model} sectionTitles={pack.sectionTitles} />
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

      <JournalDialog pack={pack} open={journalOpen} onClose={() => setJournalOpen(false)} />
    </div>
  );
}
