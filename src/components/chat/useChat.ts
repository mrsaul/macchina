"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerStreamEvent, ClassifyResponse } from "@/app/api/copilot/events";
import { classifyIntents } from "@/lib/packs/intents";
import type { Intent } from "@/lib/packs/schema";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage, ChatPack, ProposalSource } from "./types";

const MAX_TURNS = 20; // must match the API limit

const REFUSAL_TEXT =
  "Je ne peux pas répondre à cette question. Reformulez-la, ou consultez le manuel du constructeur.";
const COMMAND_TEXT =
  "Je ne sais pas encore exécuter de commandes. Posez une question, ou décrivez une connaissance sur la machine pour la proposer à la validation.";

type Turn = { role: "user" | "assistant"; content: string };

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

/** Conversation history for the model: completed question/answer pairs only. */
function historyOf(messages: ChatMessage[]): Turn[] {
  const history: Turn[] = [];
  messages.forEach((m, i) => {
    const answer = messages[i + 1];
    if (
      m.author === "user" &&
      answer?.author === "assistant" &&
      answer.kind === "answer" &&
      answer.status === "done" &&
      answer.text.trim()
    ) {
      history.push({ role: "user", content: m.text }, { role: "assistant", content: answer.text });
    }
  });
  return history;
}

async function errorFrom(response: Response, fallback: string) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

/**
 * @param canContribute contributors and maintainers: each message is first
 * classified; knowledge ("info") becomes a proposal to confirm, questions get
 * an answer. Everyone else always gets an answer.
 */
export function useChat(pack: ChatPack, { canContribute }: { canContribute: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const abortRef = useRef<AbortController | null>(null);

  // Stop any in-flight request when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = messages.some((m) => m.status === "streaming" || m.proposal?.state === "sending");

  const patch = useCallback(
    (ids: string[], change: (m: ChatMessage) => Partial<ChatMessage>) =>
      setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, ...change(m) } : m))),
    [],
  );

  const streamAnswer = useCallback(
    async (ids: { user: string; answer: string }, turns: Turn[], keywordIntents: Intent[], signal: AbortSignal) => {
      const fail = (error: string) => patch([ids.answer], () => ({ status: "error", error }));

      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "answer", machineId: pack.id, turns }),
        signal,
      });
      if (!response.ok || !response.body) return fail(await errorFrom(response, "L'assistant ne répond pas. Réessayez."));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let finished = false;

      const handle = (event: AnswerStreamEvent) => {
        switch (event.type) {
          case "intents": {
            const intents = mergeIntents(event.ids, keywordIntents, pack.intents);
            patch([ids.user, ids.answer], () => ({ intents }));
            break;
          }
          case "text":
            patch([ids.answer], (m) => ({ text: m.text + event.text }));
            break;
          case "sources":
            patch([ids.answer], () => ({ sources: event.sources }));
            break;
          case "done":
            finished = true;
            if (event.stopReason === "refusal") {
              // A refusal can arrive mid-stream: drop the partial answer.
              patch([ids.answer], () => ({ status: "refused", text: REFUSAL_TEXT }));
            } else {
              patch([ids.answer], () => ({ status: event.stopReason === "max_tokens" ? "truncated" : "done" }));
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
    },
    [pack.id, pack.intents, patch],
  );

  /** Returns the classification, or null when the message should just be answered. */
  const classify = useCallback(
    async (message: string, signal: AbortSignal): Promise<ClassifyResponse | { error: string } | null> => {
      const response = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "classify", machineId: pack.id, message }),
        signal,
      });
      // Role changed since the page loaded: treat the message as a question.
      if (response.status === 401 || response.status === 403) return null;
      if (!response.ok) return { error: await errorFrom(response, "Je n'ai pas pu analyser votre message. Réessayez.") };
      return (await response.json()) as ClassifyResponse;
    },
    [pack.id],
  );

  const send = useCallback(
    async (question: string) => {
      const turns = [...historyOf(messagesRef.current), { role: "user" as const, content: question }].slice(-MAX_TURNS);
      while (turns[0]?.role !== "user") turns.shift();

      const keywordIntents = classifyIntents(question, pack.intents);
      const stamp = Date.now();
      const ids = { user: `u-${stamp}`, answer: `a-${stamp}` };
      setMessages((prev) => [
        ...prev,
        { id: ids.user, author: "user", kind: "answer", text: question, intents: keywordIntents, status: "done" },
        { id: ids.answer, author: "assistant", kind: "answer", text: "", intents: keywordIntents, status: "streaming" },
      ]);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (canContribute) {
          const result = await classify(question, controller.signal);
          if (result && "error" in result) {
            return patch([ids.answer], () => ({ status: "error", error: result.error }));
          }
          if (result?.kind === "info") {
            return patch([ids.answer], () => ({
              kind: "proposal",
              status: "done",
              proposal: { entries: result.entries, state: "pending" },
            }));
          }
          if (result?.kind === "command") {
            return patch([ids.answer], () => ({ kind: "notice", status: "done", text: COMMAND_TEXT }));
          }
        }
        await streamAnswer(ids, turns, keywordIntents, controller.signal);
      } catch {
        if (!controller.signal.aborted) {
          patch([ids.answer], () => ({ status: "error", error: "Connexion perdue. Vérifiez le réseau et réessayez." }));
        }
      }
    },
    [canContribute, classify, pack.intents, patch, streamAnswer],
  );

  /** Saves the proposal's entries as "proposed" contributions (RLS checks the role). */
  const confirmProposal = useCallback(
    async (messageId: string, source: ProposalSource) => {
      const message = messagesRef.current.find((m) => m.id === messageId);
      if (!message?.proposal || message.proposal.state !== "pending") return;

      patch([messageId], (m) => ({ proposal: { ...m.proposal!, state: "sending", error: undefined } }));
      const { data, error } = await createClient()
        .from("contributions")
        .insert(
          message.proposal.entries.map((e) => ({
            machine_id: pack.id,
            text: e.text,
            section: e.section,
            safety: e.safety,
            // "self" leaves the label empty: the database fills in the
            // contributor's username.
            source_type: source.type === "self" ? "contributor" : source.type,
            source_label: source.type === "self" ? null : source.label.trim(),
          })),
        )
        .select("id");

      patch([messageId], (m) => ({
        proposal:
          error || !data?.length
            ? {
                ...m.proposal!,
                state: "pending",
                error: error?.message.includes("username")
                  ? "Choisis d'abord ton nom d'utilisateur (page Compte), puis réessaie."
                  : "L'envoi a échoué. Vérifiez que vous êtes connecté, puis réessayez.",
              }
            : { ...m.proposal!, state: "sent" },
      }));
    },
    [pack.id, patch],
  );

  const cancelProposal = useCallback(
    (messageId: string) => patch([messageId], (m) => ({ proposal: { ...m.proposal!, state: "cancelled" } })),
    [patch],
  );

  return { messages, busy, send, confirmProposal, cancelProposal };
}
