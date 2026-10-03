import { Tag } from "@/components/ui";
import type { ChatMessage } from "./types";

const CITATION = /\[§([a-z0-9-]+)\]/g;

/** Renders [§section-id] citations as inline inverted markers. */
function AnswerText({ text }: { text: string }) {
  const parts = text.split(CITATION); // odd indexes are section ids
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="mx-0.5 bg-ink px-1 text-xs text-paper">
            §{part}
          </span>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function citedSections(text: string) {
  return [...new Set([...text.matchAll(CITATION)].map((m) => m[1]))];
}

const STATUS_NOTES: Partial<Record<ChatMessage["status"], string>> = {
  truncated: "Réponse tronquée — posez une question plus précise pour la suite.",
  refused: "Réponse refusée par l'assistant",
};

export function MessageList({
  messages,
  assistantLabel,
  sectionTitles,
}: {
  messages: ChatMessage[];
  assistantLabel: string;
  sectionTitles: Record<string, string>;
}) {
  return (
    <ol className="space-y-6">
      {messages.map((m) => {
        const isUser = m.author === "user";
        const safety = m.intents.some((i) => i.safety);
        const sources = isUser ? [] : citedSections(m.text);
        const waiting = m.status === "streaming" && !m.text;

        return (
          <li key={m.id} className={isUser ? "border-l-rule border-line pl-4" : "border-rule border-line bg-panel"}>
            <div className={`flex flex-wrap items-center gap-2 ${isUser ? "" : "border-b-rule border-line px-4 py-2"}`}>
              <span className="text-xs font-bold uppercase tracking-widest">{isUser ? "Vous" : assistantLabel}</span>
              {m.intents.map((intent) => (
                <Tag key={intent.id}>{intent.label}</Tag>
              ))}
            </div>

            <div className={isUser ? "mt-2" : "space-y-3 p-4"} aria-live={isUser ? undefined : "polite"} aria-busy={m.status === "streaming"}>
              {!isUser && safety && (
                <p role="note" className="border-rule border-line px-3 py-2 text-xs uppercase leading-relaxed tracking-wider">
                  ⚠ Sécurité — chaleur, feu ou limites machine. En cas de doute, arrêtez la machine et suivez le
                  manuel constructeur.
                </p>
              )}

              {waiting ? (
                <p className="text-xs uppercase tracking-wider text-muted">
                  <span className="animate-pulse">■</span> Recherche dans le pack…
                </p>
              ) : isUser ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>
              ) : (
                m.text && <AnswerText text={m.text} />
              )}

              {m.status === "error" && (
                <p role="alert" className="border-l-rule border-line pl-3 text-sm">
                  {m.error}
                </p>
              )}
              {STATUS_NOTES[m.status] && (
                <p className="text-xs uppercase tracking-wider text-muted">{STATUS_NOTES[m.status]}</p>
              )}

              {sources.length > 0 && m.status !== "streaming" && (
                <div className="flex flex-wrap items-center gap-2 border-t-rule border-line pt-3">
                  <span className="text-xs uppercase tracking-wider text-muted">Sources</span>
                  {sources.map((id) => (
                    <span key={id} className="border-rule border-line px-2 py-0.5 text-xs uppercase tracking-wider">
                      §{id}
                      {sectionTitles[id] ? ` — ${sectionTitles[id]}` : " (section inconnue)"}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
