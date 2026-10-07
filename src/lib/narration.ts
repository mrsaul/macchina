import { z } from "zod";
import type { Limit } from "@/lib/packs/schema";

// Live narration: the roaster types (or pastes from Roastware) the current
// readings; the assistant comments on them. Advice only — the app never talks
// to the machine.

export const PHASES = [
  { id: "preheat", label: "Préchauffage" },
  { id: "charge", label: "Charge / point bas" },
  { id: "drying", label: "Séchage" },
  { id: "maillard", label: "Maillard" },
  { id: "first_crack", label: "Premier crack" },
  { id: "development", label: "Développement" },
  { id: "cooling", label: "Refroidissement" },
] as const;

export type PhaseId = (typeof PHASES)[number]["id"];
export const PHASE_IDS = PHASES.map((p) => p.id) as [PhaseId, ...PhaseId[]];
export const phaseLabel = (id: PhaseId) => PHASES.find((p) => p.id === id)?.label ?? id;

/** Loose physical bounds: reject typos, not real values. */
export const ReadingSchema = z.object({
  /** Seconds since charge, if known. */
  elapsed: z.number().int().min(0).max(7200).optional(),
  beanSurface: z.number().min(-50).max(500).optional(),
  internal: z.number().min(-50).max(500).optional(),
  ror: z.number().min(-100).max(200).optional(),
  phase: z.enum(PHASE_IDS).optional(),
  dtr: z.number().min(0).max(100).optional(),
});
export type Reading = z.infer<typeof ReadingSchema>;

export const hasValues = (r: Reading) =>
  r.beanSurface !== undefined || r.internal !== undefined || r.ror !== undefined || r.dtr !== undefined;

/** "198,3" or "198.3 °C" → 198.3; empty or invalid → undefined. */
export function parseNumber(raw: string): number | undefined {
  const match = raw.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : undefined;
}

/** "9:30" or "570" → seconds. */
export function parseElapsed(raw: string): number | undefined {
  const mmss = raw.match(/(\d{1,3}):(\d{2})/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const n = parseNumber(raw);
  return n === undefined ? undefined : Math.round(n);
}

export function formatElapsed(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const PHASE_WORDS: [RegExp, PhaseId][] = [
  [/pr[ée]chauff|preheat/i, "preheat"],
  [/charge|turning|point bas|tp\b/i, "charge"],
  [/s[ée]chage|drying|dry\b/i, "drying"],
  [/maillard/i, "maillard"],
  [/first ?crack|premier ?crack|\bfc\b/i, "first_crack"],
  [/d[ée]velop|development|dev\b/i, "development"],
  [/refroid|cool/i, "cooling"],
];

function valueAfter(text: string, labels: RegExp) {
  // Roastware labels end with "Temp" ("Bean Surface Temp 198.3"): allow it.
  const m = text.match(
    new RegExp(`(?:${labels.source})(?:\\s*temp(?:erature)?)?\\s*[:=]?\\s*(-?\\d+(?:[.,]\\d+)?)`, "i"),
  );
  return m ? parseNumber(m[1]) : undefined;
}

/**
 * Best-effort parser for text copied from Roastware (or any logger). It looks
 * for labelled values ("Bean Surface 198.3", "RoR: 9,2", "DTR 18%", "9:30")
 * and leaves out anything it cannot read, so the form can be checked by hand.
 */
export function parsePastedReadings(text: string): Partial<Reading> {
  const out: Partial<Reading> = {};
  // No bare "surface": Roastware also shows "Drum Surface Temp".
  const beanSurface = valueAfter(text, /bean\s*surface|\bbs\b|\bbt\b|bean\s*temp/);
  // No bare "et"/"air": too common in French prose to be labels.
  const internal = valueAfter(text, /internal|interne|\bit\b/);
  const ror = valueAfter(text, /\bror\b|rate\s*of\s*rise/);
  const dtr = valueAfter(text, /\bdtr\b|development\s*(?:time\s*)?ratio/);
  const time = text.match(/(?:time|temps|elapsed|durée)?\s*[:=]?\s*(\d{1,2}:\d{2})/i);

  if (beanSurface !== undefined) out.beanSurface = beanSurface;
  if (internal !== undefined) out.internal = internal;
  if (ror !== undefined) out.ror = ror;
  if (dtr !== undefined) out.dtr = dtr;
  if (time) out.elapsed = parseElapsed(time[1]);
  const phase = PHASE_WORDS.find(([re]) => re.test(text));
  if (phase) out.phase = phase[1];
  return out;
}

export type LimitAlert = { label: string; value: number; limit: number; unit: string; kind: "max" | "min"; source: string };

const METRIC_OF: Record<Limit["metric"], keyof Reading> = {
  bean_surface: "beanSurface",
  internal: "internal",
  ror: "ror",
};

/** Deterministic check against the pack's sourced limits. */
export function checkLimits(reading: Reading, limits: Limit[]): LimitAlert[] {
  const alerts: LimitAlert[] = [];
  for (const limit of limits) {
    const value = reading[METRIC_OF[limit.metric]];
    if (typeof value !== "number") continue;
    if (limit.max !== undefined && value > limit.max) {
      alerts.push({ label: limit.label, value, limit: limit.max, unit: limit.unit, kind: "max", source: limit.source });
    }
    if (limit.min !== undefined && value < limit.min) {
      alerts.push({ label: limit.label, value, limit: limit.min, unit: limit.unit, kind: "min", source: limit.source });
    }
  }
  return alerts;
}
