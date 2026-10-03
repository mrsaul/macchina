"use client";

import { useCallback, useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { ActionButton, Tag } from "@/components/ui";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

type ComposerProps = {
  text: string;
  onTextChange: (text: string) => void;
  /** True when the field holds dictated text the user has not confirmed yet. */
  dictated: boolean;
  onDictatedChange: (dictated: boolean) => void;
  onSend: (text: string) => void;
  /** An answer is streaming: the field stays editable, sending waits. */
  busy?: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
      <rect x="9" y="3" width="6" height="11" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function Composer({ text, onTextChange, dictated, onDictatedChange, onSend, busy = false, textareaRef }: ComposerProps) {
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Dictation fills the field and stops there: the user always reviews and sends.
  const appendDictation = useCallback(
    (phrase: string) => {
      const current = textRef.current.trimEnd();
      onTextChange(current ? `${current} ${phrase}` : phrase);
      onDictatedChange(true);
    },
    [onTextChange, onDictatedChange],
  );

  const speech = useSpeechRecognition({ lang: "fr-FR", onFinal: appendDictation });
  const canSend = text.trim().length > 0 && !speech.listening && !busy;

  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    onSend(text.trim());
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
  }

  const micLabel = !speech.supported
    ? "Dictée indisponible dans ce navigateur (essayez Chrome, Edge ou Safari)"
    : speech.listening
      ? "Arrêter la dictée"
      : "Dicter la question";

  return (
    <form
      onSubmit={submit}
      className="sticky bottom-0 border-t-rule border-line bg-paper pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto w-full max-w-3xl space-y-2 px-4 py-3 sm:px-8">
        {speech.listening && (
          <p role="status" className="flex items-center gap-2 text-xs uppercase tracking-wider">
            <Tag>● Écoute</Tag>
            <span className="truncate text-muted">{speech.interim || "Parlez…"}</span>
          </p>
        )}
        {!speech.listening && dictated && text.trim() && (
          <p role="status" className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider">
            <Tag>Dicté</Tag>
            <span className="text-muted">Vérifiez le texte, puis envoyez.</span>
          </p>
        )}
        {speech.error && (
          <p role="alert" className="border-l-rule border-line pl-3 text-xs">
            {speech.error}
          </p>
        )}

        <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            disabled={!speech.supported}
            aria-pressed={speech.listening}
            aria-label={micLabel}
            title={micLabel}
            className={`flex w-12 shrink-0 items-center justify-center border-rule border-line ${
              speech.listening ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-panel"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <MicIcon />
          </button>

          <label className="min-w-0 flex-1">
            <span className="sr-only">Votre question</span>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                onTextChange(e.target.value);
                if (!e.target.value.trim()) onDictatedChange(false);
              }}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Posez votre question…"
              className={`block field-sizing-content max-h-40 min-h-12 w-full resize-none bg-paper px-3 py-3 text-sm text-ink placeholder:text-muted ${
                dictated && text.trim() ? "border-[3px] border-ink" : "border-rule border-line"
              }`}
            />
          </label>

          <ActionButton type="submit" disabled={!canSend} className="shrink-0 px-4 sm:px-5">
            {busy ? "…" : "Envoyer"}
          </ActionButton>
        </div>
      </div>
    </form>
  );
}
