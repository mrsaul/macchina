"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useUser } from "@/components/auth/AuthProvider";
import { ActionButton, Chip, chipClassName, Tag } from "@/components/ui";
import { NARRATION_INTERVAL_S, useNarration, type NarrationEntry } from "@/hooks/useNarration";
import {
  formatElapsed,
  hasValues,
  parseElapsed,
  parseNumber,
  parsePastedReadings,
  PHASES,
  phaseLabel,
  ReadingSchema,
  type PhaseId,
  type Reading,
} from "@/lib/narration";
import type { Limit } from "@/lib/packs/schema";

export type NarrationPack = { id: string; brand: string; model: string; version: string; limits: Limit[] };

type Form = { elapsed: string; beanSurface: string; internal: string; ror: string; dtr: string; phase: PhaseId | "" };
const EMPTY: Form = { elapsed: "", beanSurface: "", internal: "", ror: "", dtr: "", phase: "" };

const FIELDS: { key: Exclude<keyof Form, "phase">; label: string; unit: string; placeholder: string }[] = [
  { key: "beanSurface", label: "Bean Surface", unit: "°C", placeholder: "198,3" },
  { key: "internal", label: "Internal", unit: "°C", placeholder: "185" },
  { key: "ror", label: "RoR", unit: "°C/min", placeholder: "9,2" },
  { key: "dtr", label: "DTR", unit: "%", placeholder: "18" },
];

/** Roast clock: the time last typed or pasted, plus the seconds since. */
type ClockAnchor = { seconds: number; at: number } | null;

function clockNow(anchor: ClockAnchor) {
  return anchor ? anchor.seconds + Math.floor((Date.now() - anchor.at) / 1000) : undefined;
}

function toReading(form: Form, anchor: ClockAnchor): Reading | null {
  const reading: Reading = {
    elapsed: clockNow(anchor),
    beanSurface: form.beanSurface ? parseNumber(form.beanSurface) : undefined,
    internal: form.internal ? parseNumber(form.internal) : undefined,
    ror: form.ror ? parseNumber(form.ror) : undefined,
    dtr: form.dtr ? parseNumber(form.dtr) : undefined,
    phase: form.phase || undefined,
  };
  const parsed = ReadingSchema.safeParse(reading);
  return parsed.success && hasValues(parsed.data) ? parsed.data : null;
}

const fieldClass =
  "w-full border-rule border-line bg-paper px-3 py-2 text-ink placeholder:text-muted/60 focus-visible:outline-offset-0";

function SafetyBlock({ entry }: { entry: NarrationEntry }) {
  const safety = entry.narration?.safety;
  const alerts = entry.narration?.limitAlerts ?? [];
  if (!safety || safety.level === "none") return null;
  const danger = safety.level === "danger";
  return (
    <div
      role={danger ? "alert" : "note"}
      className={`px-3 py-2 text-sm leading-relaxed ${danger ? "bg-ink font-bold text-paper" : "border-rule border-line"}`}
    >
      <p className="text-xs uppercase tracking-widest">{danger ? "⚠ Danger" : "⚠ Attention"}</p>
      <p>{safety.message}</p>
      {alerts.map((a) => (
        <p key={a.label} className="mt-1 text-xs">
          {a.label} : {a.value} {a.unit} ({a.kind === "max" ? "max" : "min"} {a.limit} {a.unit}) — source : {a.source}
        </p>
      ))}
    </div>
  );
}

function readingSummary(r: Reading) {
  return [
    r.elapsed !== undefined && formatElapsed(r.elapsed),
    r.phase && phaseLabel(r.phase),
    r.beanSurface !== undefined && `BS ${r.beanSurface}°`,
    r.internal !== undefined && `INT ${r.internal}°`,
    r.ror !== undefined && `RoR ${r.ror}`,
    r.dtr !== undefined && `DTR ${r.dtr}%`,
  ]
    .filter(Boolean)
    .join(" · ");
}

const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function NarrationScreen({ pack }: { pack: NarrationPack }) {
  const user = useUser();
  const [form, setForm] = useState<Form>(EMPTY);
  // Without a running clock, consecutive readings would share one time and
  // the model would see trends happen "in zero seconds".
  const [anchor, setAnchor] = useState<ClockAnchor>(null);
  const [paste, setPaste] = useState("");
  const [pasteFeedback, setPasteFeedback] = useState<string | null>(null);

  const reading = toReading(form, anchor);
  const getReading = useCallback(() => toReading(form, anchor), [form, anchor]);
  const session = useNarration(pack.id, getReading);
  const latestDanger = session.entries.find((e) => e.narration?.safety.level === "danger");
  const signedIn = Boolean(user);

  const set = (key: keyof Form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === "elapsed") {
      const seconds = value ? parseElapsed(value) : undefined;
      setAnchor(seconds === undefined ? null : { seconds, at: Date.now() });
    }
  };

  function applyPaste() {
    const found = parsePastedReadings(paste);
    const keys = Object.keys(found);
    if (!keys.length) return setPasteFeedback("Aucune valeur reconnue. Vérifie le texte ou saisis à la main.");
    setForm((f) => ({
      ...f,
      ...(found.beanSurface !== undefined && { beanSurface: String(found.beanSurface) }),
      ...(found.internal !== undefined && { internal: String(found.internal) }),
      ...(found.ror !== undefined && { ror: String(found.ror) }),
      ...(found.dtr !== undefined && { dtr: String(found.dtr) }),
      ...(found.elapsed !== undefined && { elapsed: formatElapsed(found.elapsed) }),
      ...(found.phase && { phase: found.phase }),
    }));
    if (found.elapsed !== undefined) setAnchor({ seconds: found.elapsed, at: Date.now() });
    setPasteFeedback(`${keys.length} valeur${keys.length > 1 ? "s" : ""} reconnue${keys.length > 1 ? "s" : ""} — vérifie avant de lancer.`);
    setPaste("");
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b-rule border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Tag className="text-sm">{pack.model}</Tag>
            <h1 className="text-sm font-bold uppercase tracking-wider">Narration live</h1>
            <Tag>Conseil uniquement</Tag>
          </div>
          <Link href="/" className={chipClassName()}>
            ← Chat
          </Link>
        </div>
      </div>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Readings */}
        <section aria-labelledby="readings-title" className="space-y-4">
          <p className="border-l-rule border-line pl-3 text-xs uppercase leading-relaxed tracking-wider text-muted">
            L&apos;assistant commente, il n&apos;agit jamais sur la machine. Tu restes aux commandes.
          </p>

          <div className="border-rule border-line">
            <h2 id="readings-title" className="border-b-rule border-line px-3 py-2 text-xs font-bold uppercase tracking-widest">
              Relevés
            </h2>
            <div className="grid grid-cols-2 gap-3 p-3">
              <label className="block">
                <span className="mb-1 flex items-baseline justify-between text-xs uppercase tracking-wider">
                  Temps
                  {anchor && (
                    <span className="text-muted normal-case" aria-live="off">
                      chrono {formatElapsed(clockNow(anchor) ?? 0)}
                    </span>
                  )}
                </span>
                <input
                  value={form.elapsed}
                  onChange={(e) => set("elapsed", e.target.value)}
                  placeholder="9:30"
                  inputMode="numeric"
                  className={`${fieldClass} text-xl font-bold`}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider">Phase</span>
                <select
                  value={form.phase}
                  onChange={(e) => set("phase", e.target.value)}
                  className={`${fieldClass} h-[46px] text-sm uppercase`}
                >
                  <option value="">—</option>
                  {PHASES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 flex items-baseline justify-between text-xs uppercase tracking-wider">
                    {f.label} <span className="text-muted normal-case">{f.unit}</span>
                  </span>
                  <input
                    value={form[f.key]}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    inputMode="decimal"
                    className={`${fieldClass} text-2xl font-bold`}
                  />
                </label>
              ))}
            </div>

            <details className="border-t-rule border-line">
              <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-wider">Coller depuis Roastware</summary>
              <div className="space-y-2 px-3 pb-3">
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={3}
                  placeholder={"Bean Surface 198.3  Internal 185  RoR 9.2\nPhase Development  DTR 18%  9:30"}
                  className={`${fieldClass} resize-y text-sm`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Chip onClick={applyPaste} disabled={!paste.trim()}>
                    Remplir les champs
                  </Chip>
                  {pasteFeedback && (
                    <span role="status" className="text-xs text-muted">
                      {pasteFeedback}
                    </span>
                  )}
                </div>
              </div>
            </details>
          </div>

          <div className="space-y-2">
            {!signedIn ? (
              <p className="border-rule border-line p-3 text-sm">
                La narration live est réservée aux comptes connectés.{" "}
                <Link href="/login?next=/narration" className="underline underline-offset-4">
                  Se connecter
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {session.running ? (
                  <ActionButton onClick={session.pause}>■ Pause</ActionButton>
                ) : (
                  <ActionButton onClick={session.start} disabled={!reading}>
                    ● Lancer la narration
                  </ActionButton>
                )}
                <Chip onClick={session.commentNow} disabled={!reading || session.inFlight} className="px-4">
                  Commenter maintenant
                </Chip>
                {session.entries.length > 0 && !session.running && (
                  <Chip onClick={session.reset} className="px-4">
                    Nouvelle torréfaction
                  </Chip>
                )}
              </div>
            )}
            <p role="status" className="text-xs uppercase tracking-wider text-muted">
              {session.inFlight
                ? "Analyse du relevé…"
                : session.running
                  ? `Prochain commentaire dans ${session.countdown} s (toutes les ${NARRATION_INTERVAL_S} s, si les valeurs changent)`
                  : !reading
                    ? "Saisis au moins une mesure."
                    : "En pause."}
            </p>
            {session.notice && <p className="border-l-rule border-line pl-3 text-sm">{session.notice}</p>}
            <p className="text-xs leading-relaxed text-muted">
              Seuils de sécurité documentés :{" "}
              {pack.limits.length ? pack.limits.map((l) => l.label).join(", ") : "aucun pour l'instant (à ajouter au pack, depuis le manuel)."}
            </p>
          </div>
        </section>

        {/* Narration feed */}
        <section aria-labelledby="feed-title" className="border-rule border-line lg:self-start">
          <h2 id="feed-title" className="border-b-rule border-line px-3 py-2 text-xs font-bold uppercase tracking-widest">
            Narration
          </h2>
          {latestDanger && latestDanger === session.entries[0] && (
            <div className="border-b-rule border-line p-3">
              <SafetyBlock entry={latestDanger} />
            </div>
          )}
          {session.entries.length === 0 ? (
            <p className="p-4 text-sm leading-relaxed text-muted">
              Saisis tes relevés puis lance la narration : un commentaire arrive tout de suite, puis toutes les{" "}
              {NARRATION_INTERVAL_S} secondes.
            </p>
          ) : (
            <ol aria-live="polite" className="divide-y-[1.5px] divide-line">
              {session.entries.map((entry, i) => (
                <li key={entry.id} className={`space-y-2 px-3 py-3 ${i > 0 ? "opacity-60" : ""}`}>
                  <p className="text-xs uppercase tracking-wider text-muted">
                    {timeFormat.format(entry.at)} · {readingSummary(entry.reading)}
                  </p>
                  {entry.error ? (
                    <p role="alert" className="border-l-rule border-line pl-3 text-sm">
                      {entry.error}
                    </p>
                  ) : (
                    <>
                      {entry.narration?.comment && (
                        <p className={i === 0 ? "text-lg font-bold leading-snug" : "text-sm leading-relaxed"}>
                          {entry.narration.comment}
                        </p>
                      )}
                      {!(i === 0 && entry === latestDanger) && <SafetyBlock entry={entry} />}
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
