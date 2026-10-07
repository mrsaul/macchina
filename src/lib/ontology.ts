// Shared ontology: every machine pack, whatever the machine, has the same
// shape and the same intent ids. Only the content — controls, planned
// sections, vocabulary, keywords — changes with the machine type.

export const MACHINE_TYPES = [
  { id: "roaster", label: "Torréfacteur" },
  { id: "grinder", label: "Moulin" },
  { id: "espresso", label: "Machine espresso" },
  { id: "other", label: "Autre" },
] as const;

export type MachineType = (typeof MACHINE_TYPES)[number]["id"];
export const MACHINE_TYPE_IDS = MACHINE_TYPES.map((t) => t.id) as [MachineType, ...MachineType[]];
export const machineTypeLabel = (id: MachineType) => MACHINE_TYPES.find((t) => t.id === id)?.label ?? id;

/** Intent ids every pack uses; labels and safety flags are fixed, keywords vary. */
export const SHARED_INTENTS = [
  {
    id: "securite",
    label: "Sécurité",
    safety: true,
    // Base keywords for every machine; packs add type-specific ones.
    keywords: ["securite", "danger", "feu", "incendie", "fumee", "brule", "surchauffe", "electrique", "blessure", "limite"],
  },
  { id: "utilisation", label: "Utilisation", safety: false, keywords: ["comment", "utiliser", "demarrer", "lancer", "etape"] },
  { id: "reglages", label: "Réglages", safety: false, keywords: ["reglage", "regler", "parametre", "ajuster"] },
  { id: "entretien", label: "Entretien", safety: false, keywords: ["entretien", "nettoyage", "nettoyer", "maintenance"] },
  { id: "depannage", label: "Dépannage", safety: false, keywords: ["erreur", "panne", "probleme", "bloque", "alarme"] },
] as const;

export type SharedIntentId = (typeof SHARED_INTENTS)[number]["id"];
export const SHARED_INTENT_IDS = SHARED_INTENTS.map((i) => i.id) as [SharedIntentId, ...SharedIntentId[]];
