"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Narration } from "@/lib/ai/narrate";
import type { Reading } from "@/lib/narration";

export const NARRATION_INTERVAL_S = 20;
const MAX_PREVIOUS = 10; // must match the API limit

export type NarrationEntry = {
  id: string;
  at: Date;
  reading: Reading;
  narration?: Narration;
  error?: string;
};

export type NarrationStatus = "idle" | "running" | "paused-error";

/** Readings without the clock: a ticking timer alone is not "new data". */
function valuesKey(r: Reading) {
  return JSON.stringify([r.beanSurface, r.internal, r.ror, r.phase, r.dtr]);
}

/**
 * Live narration session: every NARRATION_INTERVAL_S seconds while running,
 * sends the current reading (if it changed) with the recent trend to
 * /api/copilot "narrate". Never sends anything to the machine.
 */
export function useNarration(machineId: string, getReading: () => Reading | null) {
  const [running, setRunning] = useState(false);
  const [countdown, setCountdown] = useState(NARRATION_INTERVAL_S);
  const [inFlight, setInFlight] = useState(false);
  const [entries, setEntries] = useState<NarrationEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const historyRef = useRef<Reading[]>([]);
  const lastKeyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const getReadingRef = useRef(getReading);
  useEffect(() => {
    getReadingRef.current = getReading;
  }, [getReading]);

  const send = useCallback(
    async (force: boolean) => {
      const reading = getReadingRef.current();
      if (!reading) return setNotice("Saisis au moins une mesure valide.");
      if (inFlightRef.current) return;
      if (!force && valuesKey(reading) === lastKeyRef.current) return setNotice("Valeurs inchangées : pas de nouveau commentaire.");

      inFlightRef.current = true;
      setInFlight(true);
      setNotice(null);
      const controller = new AbortController();
      abortRef.current = controller;
      const entry: NarrationEntry = { id: `n-${Date.now()}`, at: new Date(), reading };

      try {
        const response = await fetch("/api/copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "narrate", machineId, reading, previous: historyRef.current.slice(-MAX_PREVIOUS) }),
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as (Narration & { error?: string }) | null;

        if (response.status === 401 || response.status === 429) {
          // Stop the loop: retrying every 20 s would not help.
          setRunning(false);
          setNotice(body?.error ?? "Narration interrompue.");
          return;
        }
        if (!response.ok || !body) {
          entry.error = body?.error ?? "Commentaire indisponible pour ce relevé.";
        } else {
          entry.narration = body;
          historyRef.current = [...historyRef.current, reading].slice(-MAX_PREVIOUS);
          lastKeyRef.current = valuesKey(reading);
        }
        setEntries((prev) => [entry, ...prev]);
      } catch {
        if (!controller.signal.aborted) {
          entry.error = "Connexion perdue. Nouvel essai au prochain relevé.";
          setEntries((prev) => [entry, ...prev]);
        }
      } finally {
        inFlightRef.current = false;
        setInFlight(false);
      }
    },
    [machineId],
  );

  // One-second tick while running; fire when the countdown reaches zero. The
  // count lives in a ref so the send happens in the timer callback, not in a
  // state updater (which React may run twice).
  const countdownRef = useRef(NARRATION_INTERVAL_S);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      countdownRef.current -= 1;
      if (countdownRef.current <= 0) {
        countdownRef.current = NARRATION_INTERVAL_S;
        void send(false);
      }
      setCountdown(countdownRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [running, send]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(() => {
    setRunning(true);
    countdownRef.current = NARRATION_INTERVAL_S;
    setCountdown(NARRATION_INTERVAL_S);
    void send(true); // comment right away, then every interval
  }, [send]);

  const pause = useCallback(() => setRunning(false), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
    setEntries([]);
    setNotice(null);
    historyRef.current = [];
    lastKeyRef.current = null;
  }, []);

  return { running, countdown, inFlight, entries, notice, start, pause, reset, commentNow: () => void send(true) };
}
