import { ActionButton, Chip, Tag } from "@/components/ui";

const TOKENS = [
  { name: "paper", className: "bg-paper" },
  { name: "ink", className: "bg-ink" },
  { name: "muted", className: "bg-muted" },
  { name: "line", className: "bg-line" },
  { name: "panel", className: "bg-panel" },
];

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t-rule border-line py-6">
      <h2 className="mb-4 text-xs uppercase tracking-widest text-muted">{label}</h2>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-8">
      <div className="border-b-rule border-line pb-8">
        <p className="mb-4 text-xs uppercase tracking-wider text-muted">v0.1 — design system</p>
        <h1 className="text-2xl font-bold uppercase leading-tight sm:text-3xl">
          Comprendre et piloter
          <br />
          votre torréfacteur.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
          Démonstration des composants VIBE. Aucune logique métier pour l&apos;instant.
        </p>
      </div>

      <Section label="Tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {TOKENS.map((t) => (
            <div key={t.name} className="border-rule border-line">
              <div className={`h-14 ${t.className}`} />
              <div className="border-t-rule border-line px-2 py-1 text-xs uppercase">{t.name}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section label="<Tag>">
        <div className="flex flex-wrap gap-2">
          <Tag>Stronghold S7X</Tag>
          <Tag>Safety</Tag>
          <Tag>Pack v1.0.0</Tag>
          <Tag>Mainteneur</Tag>
        </div>
      </Section>

      <Section label="<Chip>">
        <div className="flex flex-wrap gap-2">
          <Chip selected>Torréfaction</Chip>
          <Chip>Réglages</Chip>
          <Chip>Dépannage</Chip>
          <Chip>Entretien</Chip>
          <Chip disabled>Indisponible</Chip>
        </div>
      </Section>

      <Section label="<ActionButton>">
        <div className="flex flex-wrap gap-3">
          <ActionButton>Poser une question</ActionButton>
          <ActionButton>● Parler</ActionButton>
          <ActionButton disabled>Envoyer</ActionButton>
        </div>
        <div className="mt-3">
          <ActionButton block>Démarrer une session</ActionButton>
        </div>
      </Section>

      <Section label="Composition">
        <article className="border-rule border-line bg-panel">
          <div className="flex items-center justify-between border-b-rule border-line px-4 py-2">
            <span className="text-xs uppercase tracking-wider">Réponse</span>
            <Tag>Safety</Tag>
          </div>
          <div className="space-y-3 p-4 text-sm leading-relaxed">
            <p className="uppercase text-xs tracking-wider text-muted">Exemple statique</p>
            <p>
              Ici s&apos;afficheront les réponses de l&apos;assistant, avec les sources du machine pack et
              un bandeau d&apos;avertissement pour le contenu marqué « safety ».
            </p>
            <div className="flex flex-wrap gap-2">
              <Chip>Source : s7x/profils</Chip>
              <Chip>Source : s7x/limites</Chip>
            </div>
          </div>
        </article>
      </Section>
    </div>
  );
}
