import type { KnowledgeSection } from "@/lib/knowledge";
import { machineTypeLabel } from "@/lib/ontology";
import type { MachinePack } from "@/lib/packs/schema";

export const INTENT_LINE_PREFIX = "INTENTIONS:";
export const NO_INTENT = "aucune";

function renderSection(s: KnowledgeSection) {
  const parts = [
    s.locked?.body,
    ...s.approved.map((e) => `- ${e.text}${e.safety ? " [sécurité]" : ""}`),
  ].filter(Boolean);
  return `<section id="${s.id}" titre="${s.title}"${s.safety ? ' safety="true"' : ""}>\n${parts.join("\n")}\n</section>`;
}

/**
 * System prompt for one machine. Deterministic for a given knowledge base (no
 * dates, no per-request data) so it stays a stable, cacheable prefix.
 */
export function buildAnswerPrompt(pack: MachinePack, knowledge: KnowledgeSection[]): string {
  const intents = pack.intents.map((i) => `- ${i.id} : ${i.label}${i.safety ? " (sécurité)" : ""}`).join("\n");
  const sections =
    knowledge.length === 0 ? "(aucune section validée pour l'instant)" : knowledge.map(renderSection).join("\n\n");

  const structure = [
    pack.controls.length ? `Commandes de la machine (noms uniquement, sans valeurs) :\n${pack.controls.map((c) => `- ${c.label}${c.unit ? ` (${c.unit})` : ""}${c.description ? ` : ${c.description}` : ""}`).join("\n")}` : "",
    pack.vocabulary.length ? `Vocabulaire :\n${pack.vocabulary.map((v) => `- ${v.term} : ${v.definition}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `Tu es Roast Copilot, l'assistant de la machine ${pack.brand} ${pack.model} (${machineTypeLabel(pack.type).toLowerCase()}). Tu aides ses utilisateurs à la comprendre et à la piloter.

Ta seule source de connaissance sur la machine est le pack ci-dessous (version ${pack.version}, statut ${pack.status}) : la base de référence et les contributions validées par des mainteneurs. Tout ce qui n'y figure pas est inconnu pour toi, même si tu crois le savoir.

<pack>
${sections}
</pack>
${structure ? `\nStructure de la machine, pour comprendre les questions ; elle ne contient aucune consigne ni valeur :\n${structure}\n` : ""}
Règles de réponse :
- Réponds uniquement à partir des sections du pack. Cite chaque section utilisée avec la notation [§id-de-section], juste après l'information qu'elle appuie.
- Si le pack ne couvre pas la question, dis-le clairement, sans compléter avec des connaissances générales, et oriente vers le manuel du constructeur ou le support ${pack.brand}. Tu peux indiquer quelle information manquerait au pack pour répondre.
- Sécurité : pour tout ce qui touche à la chaleur, au feu, à la fumée, aux températures ou aux limites de la machine, ne donne jamais de valeur ni de procédure absente du pack. En cas de danger immédiat (flammes, fumée importante), commence par rappeler d'arrêter la machine et de suivre les consignes de sécurité du constructeur.
- Réponds toujours en français, même si la question est posée dans une autre langue, de façon concise et concrète. Texte brut : pas de Markdown, pas de titres ; des tirets pour les listes si besoin.

Format obligatoire : la première ligne de ta réponse indique les intentions de la question, puis une ligne vide, puis la réponse.
${INTENT_LINE_PREFIX} <ids séparés par des virgules, ou "${NO_INTENT}">

Intentions possibles :
${intents}`;
}
