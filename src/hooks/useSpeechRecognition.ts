"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Minimal typings: lib.dom ships the result types but not the recognizer
// itself, which Chrome/Safari still expose as webkitSpeechRecognition.
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognizerCtor = new () => Recognizer;

function getRecognizerCtor(): RecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Accès au micro refusé. Autorisez-le dans les réglages du navigateur.",
  "service-not-allowed": "Accès au micro refusé. Autorisez-le dans les réglages du navigateur.",
  "no-speech": "Aucune parole détectée. Réessayez en parlant plus près du micro.",
  "audio-capture": "Aucun micro détecté.",
  network: "Dictée indisponible : problème de connexion.",
};

/**
 * Browser dictation (Web Speech API). Calls `onFinal` with each finalized
 * phrase; never submits anything itself. Swap this hook for a server-side
 * transcriber later without touching the UI (see CLAUDE.md, voice decision).
 */
export function useSpeechRecognition({ lang = "fr-FR", onFinal }: { lang?: string; onFinal: (text: string) => void }) {
  const supported = useSyncExternalStore(noopSubscribe, () => getRecognizerCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognizerRef = useRef<Recognizer | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const stop = useCallback(() => recognizerRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getRecognizerCtor();
    if (!Ctor || recognizerRef.current) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false; // stops after a pause, like push-to-talk
    rec.interimResults = true;

    rec.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          if (transcript.trim()) onFinalRef.current(transcript.trim());
        } else {
          pending += transcript;
        }
      }
      setInterim(pending);
    };
    rec.onerror = (event) => {
      if (event.error !== "aborted") setError(ERROR_MESSAGES[event.error] ?? "La dictée a échoué. Réessayez.");
    };
    rec.onend = () => {
      recognizerRef.current = null;
      setListening(false);
      setInterim("");
    };

    setError(null);
    setInterim("");
    recognizerRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recognizerRef.current = null;
      setError("La dictée a échoué. Réessayez.");
    }
  }, [lang]);

  // Never leave the mic open after unmount.
  useEffect(() => () => recognizerRef.current?.abort(), []);

  return { supported, listening, interim, error, start, stop };
}
