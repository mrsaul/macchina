"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerStreamEvent } from "@/app/api/copilot/events";
import { classifyIntents } from "@/lib/packs/intents";
import type { Intent } from "@/lib/packs/schema";
import type { ChatMessage, ChatPack } from "./types";

const MAX_TURNS = 20; // must match the API limit

const REFUSAL_TEXT =
  "Je ne peux pas répondre à cette question. Reformulez-la, ou consultez le manuel du constructeur.";

/**
 * Model intents win, but safety intents found by keywords are always kept:
 * a missed safety tag is worse than an extra one.
 */
function mergeIntents(modelIds: string[], keywordIntents: Intent[], all: Intent[]): Intent[] {
  const fromModel = modelIds.map((id) => all.find((i) => i.id === id)).filter((i): i is Intent => Boolean(i));
  const merged = fromModel.length ? fromModel : keywordIntents;
  for (const intent of keywordIntents) if (intent.safety && !merged.includes(intent)) merged.push(intent);
  return [...merged].sort((a, b) => Number(b.safety) - Number(a.safety));
}

export function useChat(pack: ChatPack) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const abortRef = useRef<AbortController | null>(null);

  // Stop any in-flight answer when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = messages.some((m) => m.status === "streaming");

  const send = useCallback(
    async (question: string) => {
      // History: only complete exchanges (question + finished answer). A question
      // whose answer failed or was refused is left out, not resent.
      const history: { role: "user" | "assistant"; content: string }[] = [];
      const previous = messagesRef.current;
      previous.forEach((m, i) => {
        const answer = previous[i + 1];
        if (m.author === "user" && answer?.author === "assistant" && answer.status === "done" && answer.text.trim()) {
          history.push({ role: "user", content: m.text }, { role: "assistant", content: answer.text });
        }
      });
      const turns = [...history, { role: "user" as const, content: question }].slice(-MAX_TURNS);
      while (turns[0]?.role !== "user") turns.shift();

      const keywordIntents = classifyIntents(question, pack.intents);
      const stamp = Date.now();
      const userId = `u-${stamp}`;
      const answerId = `a-${stamp}`;
      setMessages((prev) => [
        ...prev,
        { id: userId, author: "user", text: question, intents: keywordIntents, status: "done" },
        { id: answerId, author: "assistant", text: "", intents: keywordIntents, status: "streaming" },
      ]);

      const update = (patch: (m: ChatMessage) => Partial<ChatMessage>, ids: string[] = [answerId]) =>
        setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, ...patch(m) } : m)));
      const fail = (error: string) => update(() => ({ status: "error", error }));

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "answer", machineId: pack.id, turns }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          return fail(body?.error ?? "L'assistant ne répond pas. Réessayez.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        let finished = false;

        const handle = (event: AnswerStreamEvent) => {
          switch (event.type) {
            case "intents": {
              const intents = mergeIntents(event.ids, keywordIntents, pack.intents);
              update(() => ({ intents }), [userId, answerId]);
              break;
            }
            case "text":
              update((m) => ({ text: m.text + event.text }));
              break;
            case "done":
              finished = true;
              if (event.stopReason === "refusal") {
                // A refusal can arrive mid-stream: drop the partial answer.
                update(() => ({ status: "refused", text: REFUSAL_TEXT }));
              } else {
                update(() => ({ status: event.stopReason === "max_tokens" ? "truncated" : "done" }));
              }
              break;
            case "error":
              finished = true;
              fail(event.message);
              break;
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) handle(JSON.parse(line) as AnswerStreamEvent);
        }
        if (pending.trim()) handle(JSON.parse(pending) as AnswerStreamEvent);
        if (!finished) fail("La réponse a été interrompue. Réessayez.");
      } catch {
        if (!controller.signal.aborted) fail("Connexion perdue. Vérifiez le réseau et réessayez.");
      }
    },
    [pack.id, pack.intents],
  );

  return { messages, busy, send };
}
