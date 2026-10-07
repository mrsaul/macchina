import { z } from "zod";
import type { KnowledgeSection } from "@/lib/knowledge";
import { formatElapsed, phaseLabel, type LimitAlert, type Reading } from "@/lib/narration";
import type { MachinePack } from "@/lib/packs/schema";

export const SafetyLevel = z.enum(["none", "attention", "danger"]);

/** What the model must return (structured outputs). */
export const NarrationSchema = z.object({
  comment: z.string(),
  safety: z.object({ level: SafetyLevel, message: z.string() }),
});
export type Narration = z.infer<typeof NarrationSchema> & { limitAlerts: LimitAlert[] };

export function buildNarratePrompt(pack: MachinePack, knowledge: KnowledgeSection[]): string {
  const sections =
    knowledge.length === 0
      ? "(aucune section validée pour l'instant)"
      : knowledge
          .map((s) => {
            const body = [s.locked?.body, ...s.approved.map((e) => `- ${e.text}`)].filter(Boolean).join("\n");
            return `<section id="${s.id}" titre="${s.title}">\n${body}\n</section>`;
          })
          .join("\n\n");
  const limits =
    pack.limits.length === 0
      ? "(aucun seuil documenté pour cette machine)"
      : pack.limits
          .map((l) => `- ${l.label} : ${l.min !== undefined ? `min ${l.min} ` : ""}${l.max !== undefined ? `max ${l.max} ` : ""}${l.unit} (source : ${l.source})`)
          .join("\n");

  return `Tu es Roast Copilot en mode narration live, aux côtés d'un torréfacteur qui pilote une ${pack.brand} ${pack.model}. Toutes les vingt secondes environ, tu reçois les relevés en cours et les relevés précédents.

Ton rôle : commenter la dynamique de la torréfaction, en une ou deux phrases courtes, en français, en tutoyant. Exemple de ton : "RoR en baisse, tu dérives vers un baked roast — réduis l'énergie progressivement."
- Lis la tendance (évolution du RoR, des températures, durée de la phase, DTR) plutôt que la dernière valeur seule.
- Tu peux t'appuyer sur les principes généraux de la torréfaction pour interpréter la courbe.
- Les commandes et réglages propres à la machine, et toute valeur chiffrée (température cible, durée, seuil), ne peuvent venir que du pack ci-dessous. Si le pack ne les donne pas, conseille en termes généraux (plus ou moins d'énergie, d'air) sans inventer de chiffre ni de commande.
- Tu ne fais que conseiller : tu n'agis jamais sur la machine et tu ne prétends pas le faire.
- Si rien ne mérite d'être signalé, dis-le en quelques mots.

Sécurité (champ "safety") :
- "danger" : risque immédiat (signe d'emballement thermique, valeur au-delà d'un seuil documenté, fumée ou feu mentionnés). Le message commence par l'action de mise en sécurité : arrêter la chauffe et suivre les consignes du constructeur.
- "attention" : dérive à surveiller pour la sécurité (montée anormalement rapide, valeurs incohérentes entre elles).
- "none" : rien à signaler ; message vide.
N'invente jamais de seuil chiffré : seuls ceux listés ci-dessous font foi.

Seuils documentés :
${limits}

<pack>
${sections}
</pack>`;
}

function line(r: Reading & { at?: number }) {
  return [
    r.elapsed !== undefined ? `t=${formatElapsed(r.elapsed)}` : null,
    r.phase ? `phase=${phaseLabel(r.phase)}` : null,
    r.beanSurface !== undefined ? `bean surface=${r.beanSurface} °C` : null,
    r.internal !== undefined ? `interne=${r.internal} °C` : null,
    r.ror !== undefined ? `RoR=${r.ror} °C/min` : null,
    r.dtr !== undefined ? `DTR=${r.dtr} %` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** The user turn: current reading, recent trend, and server-checked limit breaches. */
export function buildNarrateMessage(current: Reading, previous: Reading[], limitAlerts: LimitAlert[]): string {
  const history = previous.length ? previous.map((r) => `- ${line(r)}`).join("\n") : "(premier relevé)";
  const breaches = limitAlerts.length
    ? limitAlerts
        .map((a) => `- ${a.label} : ${a.value} ${a.unit} (${a.kind === "max" ? "au-dessus du max" : "sous le min"} ${a.limit} ${a.unit})`)
        .join("\n")
    : "(aucun)";
  return `Relevés précédents, du plus ancien au plus récent :
${history}

Relevé actuel :
- ${line(current)}

Seuils dépassés (vérifiés par le serveur) :
${breaches}`;
}
