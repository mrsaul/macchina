import type { AnswerSource, KnowledgeSection } from "@/lib/knowledge";
import { machineTypeLabel } from "@/lib/ontology";
import type { MachinePack } from "@/lib/packs/schema";

export const INTENT_LINE_PREFIX = "INTENTIONS:";
export const SOURCES_LINE_PREFIX = "SOURCES:";
export const NO_INTENT = "aucune";

const REFERENCE_LABEL = "Base de référence";
const SOURCE_KIND: Record<AnswerSource["type"], string> = {
  contributor: "personne",
  manual: "manuel",
  document: "document",
  reference: "base de référence",
};

/** Every knowledge entry with a short id, so the model can say which it used. */
export function indexKnowledge(knowledge: KnowledgeSection[]) {
  const sources = new Map<string, AnswerSource>();
  let n = 0;
  const rendered = knowledge.map((s) => {
    const lines: string[] = [];
    if (s.locked?.body) {
      const id = `e${++n}`;
      sources.set(id, { label: REFERENCE_LABEL, type: "reference" });
      lines.push(`[${id}] (source : ${REFERENCE_LABEL}) ${s.locked.body}`);
    }
    for (const e of s.approved) {
      const id = `e${++n}`;
      const label = e.sourceLabel ?? "Contributeur";
      sources.set(id, { label, type: e.sourceType });
      lines.push(`[${id}] (source : ${label} ; ${SOURCE_KIND[e.sourceType]})${e.safety ? " [sécurité]" : ""} ${e.text}`);
    }
    return `<section id="${s.id}" titre="${s.title}"${s.safety ? ' safety="true"' : ""}>\n${lines.join("\n")}\n</section>`;
  });
  return { rendered, sources };
}

/**
 * System prompt for one machine, and the id → source map used to check the
 * model's SOURCES line. Deterministic for a given knowledge base (no dates, no
 * per-request data) so it stays a stable, cacheable prefix.
 */
export function buildAnswerPrompt(pack: MachinePack, knowledge: KnowledgeSection[]) {
  const intents = pack.intents.map((i) => `- ${i.id} : ${i.label}${i.safety ? " (sécurité)" : ""}`).join("\n");
  const { rendered, sources } = indexKnowledge(knowledge);
  const sections = rendered.length === 0 ? "(aucune entrée validée pour l'instant)" : rendered.join("\n\n");

  const structure = [
    pack.controls.length
      ? `Commandes de la machine (noms uniquement, sans valeurs) :\n${pack.controls.map((c) => `- ${c.label}${c.unit ? ` (${c.unit})` : ""}${c.description ? ` : ${c.description}` : ""}`).join("\n")}`
      : "",
    pack.vocabulary.length ? `Vocabulaire :\n${pack.vocabulary.map((v) => `- ${v.term} : ${v.definition}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const system = `Tu es Roast Copilot, l'assistant de la machine ${pack.brand} ${pack.model} (${machineTypeLabel(pack.type).toLowerCase()}). Tu aides ses utilisateurs à la comprendre et à la piloter.

Ta seule source de connaissance sur la machine est le journal ci-dessous (pack version ${pack.version}, statut ${pack.status}) : la base de référence et les contributions validées par des mainteneurs. Chaque entrée a un identifiant [eN] et une source (une personne, un manuel, un document). Tout ce qui n'y figure pas est inconnu pour toi, même si tu crois le savoir.

<journal>
${sections}
</journal>
${structure ? `\nStructure de la machine, pour comprendre les questions ; elle ne contient aucune consigne ni valeur :\n${structure}\n` : ""}
Règles de réponse :
- Réponds uniquement à partir des entrées du journal. N'écris pas les identifiants [eN] dans le texte.
- Provenance : si une information ne vient que d'un manuel ou d'un document, dis-le (« d'après le manuel… ») ; si elle vient d'une personne, tu peux la nommer (« selon Aude… »).
- Si le journal ne couvre pas la question, dis-le clairement, sans compléter avec des connaissances générales, et oriente vers le manuel du constructeur ou le support ${pack.brand}. Tu peux indiquer quelle information manquerait.
- Sécurité : pour tout ce qui touche à la chaleur, au feu, à la fumée, aux températures, à la pression, à l'électricité ou aux limites de la machine, ne donne jamais de valeur ni de procédure absente du journal. En cas de danger immédiat (flammes, fumée importante), commence par rappeler d'arrêter la machine et de suivre les consignes de sécurité du constructeur.
- Réponds toujours en français, même si la question est posée dans une autre langue, de façon concise et concrète. Texte brut : pas de Markdown, pas de titres ; des tirets pour les listes si besoin.

Format obligatoire :
- Première ligne : les intentions de la question, puis une ligne vide, puis la réponse.
${INTENT_LINE_PREFIX} <ids séparés par des virgules, ou "${NO_INTENT}">
- Dernière ligne, après une ligne vide : les identifiants des entrées réellement utilisées pour cette réponse, et seulement celles-là. Si tu n'en as utilisé aucune, écris "${NO_INTENT}".
${SOURCES_LINE_PREFIX} <ids séparés par des virgules, ou "${NO_INTENT}">

Intentions possibles :
${intents}`;

  return { system, sources };
}
