import { Tag } from "@/components/ui";
import { ProposalCard } from "./ProposalCard";
import type { AnswerSource } from "@/lib/knowledge";
import type { ChatMessage, ProposalSource } from "./types";

const SOURCE_KIND: Record<AnswerSource["type"], string> = {
  contributor: "Personne",
  manual: "Manuel",
  document: "Document",
  reference: "Base de référence",
};

/** "Sources : Saul · Aude · Manuel du moulin" — only what the model declared using. */
function Sources({ sources }: { sources: AnswerSource[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t-rule border-line pt-3">
      <span className="text-xs uppercase tracking-wider text-muted">Sources :</span>
      {sources.map((s) => (
        <span
          key={s.label}
          title={SOURCE_KIND[s.type]}
          className={`px-2 py-0.5 text-xs tracking-wider ${
            s.type === "contributor" ? "border-rule border-line" : "bg-ink font-bold text-paper"
          }`}
        >
          {s.type !== "contributor" && <span className="mr-1 uppercase">{SOURCE_KIND[s.type]} ·</span>}
          {s.label}
        </span>
      ))}
    </div>
  );
}

const STATUS_NOTES: Partial<Record<ChatMessage["status"], string>> = {
  truncated: "Réponse tronquée — posez une question plus précise pour la suite.",
  refused: "Réponse refusée par l'assistant",
};

export function MessageList({
  messages,
  assistantLabel,
  sectionTitles,
  onConfirmProposal,
  onCancelProposal,
}: {
  messages: ChatMessage[];
  assistantLabel: string;
  sectionTitles: Record<string, string>;
  onConfirmProposal: (messageId: string, source: ProposalSource) => void;
  onCancelProposal: (messageId: string) => void;
}) {
  return (
    <ol className="space-y-6">
      {messages.map((m) => {
        const isUser = m.author === "user";
        const safety = m.intents.some((i) => i.safety);
        const waiting = m.status === "streaming" && !m.text;

        if (m.kind === "proposal" && m.proposal) {
          return (
            <li key={m.id}>
              <ProposalCard
                label={assistantLabel}
                proposal={m.proposal}
                sectionTitles={sectionTitles}
                onConfirm={(source) => onConfirmProposal(m.id, source)}
                onCancel={() => onCancelProposal(m.id)}
              />
            </li>
          );
        }

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
                  <span className="animate-pulse">■</span> Analyse en cours…
                </p>
              ) : isUser ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>
              ) : (
                m.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>
              )}

              {m.status === "error" && (
                <p role="alert" className="border-l-rule border-line pl-3 text-sm">
                  {m.error}
                </p>
              )}
              {STATUS_NOTES[m.status] && (
                <p className="text-xs uppercase tracking-wider text-muted">{STATUS_NOTES[m.status]}</p>
              )}

              {!isUser && m.sources && m.sources.length > 0 && m.status !== "streaming" && (
                <Sources sources={m.sources} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
