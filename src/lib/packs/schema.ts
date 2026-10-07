import { z } from "zod";
import { MACHINE_TYPE_IDS } from "@/lib/ontology";

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const IntentSchema = z.object({
  id: slug,
  label: z.string().min(1),
  /** Questions in this category touch heat, fire or machine limits. */
  safety: z.boolean().default(false),
  /** Lowercase, accent-free keywords; matched as substrings of the normalized question. */
  keywords: z.array(z.string().min(1)).min(1),
});

export const SuggestionSchema = z.object({
  text: z.string().min(1),
  intent: slug.optional(),
});

export const JournalEntrySchema = z.object({
  date: z.iso.date(),
  version: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  safety: z.boolean().default(false),
});

export const SectionSchema = z.object({
  id: slug,
  title: z.string().min(1),
  safety: z.boolean().default(false),
  body: z.string(),
});

/** A command the operator acts on (hot air, grind size…). Names only, no values. */
export const ControlSchema = z.object({
  id: slug,
  label: z.string().min(1),
  description: z.string().default(""),
  /** Unit the control is expressed in, if any ("RPM", "g", "°C"). Never a value. */
  unit: z.string().optional(),
});

/** A section the knowledge base is expected to have, filled by contributions. */
export const OutlineSectionSchema = z.object({
  id: slug,
  title: z.string().min(1),
  description: z.string().default(""),
});

export const VocabularySchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
});

/**
 * A hard safety threshold for live narration, checked by the server — never
 * by the model. Only from a verifiable source (manual, manufacturer).
 */
export const LimitSchema = z
  .object({
    metric: z.enum(["bean_surface", "internal", "ror"]),
    min: z.number().optional(),
    max: z.number().optional(),
    unit: z.string().min(1),
    label: z.string().min(1),
    source: z.string().min(1, "un seuil doit citer sa source"),
  })
  .refine((l) => l.min !== undefined || l.max !== undefined, { message: "min ou max requis" });

export const MachinePackSchema = z
  .object({
    id: slug,
    brand: z.string().min(1),
    model: z.string().min(1),
    type: z.enum(MACHINE_TYPE_IDS).default("roaster"),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "semver attendu"),
    status: z.enum(["draft", "published"]),
    language: z.string().min(2),
    description: z.string().optional(),
    sources: z.array(z.unknown()).default([]),
    sections: z.array(SectionSchema).default([]),
    intents: z.array(IntentSchema).default([]),
    suggestions: z.array(SuggestionSchema).default([]),
    journal: z.array(JournalEntrySchema).default([]),
    limits: z.array(LimitSchema).default([]),
    controls: z.array(ControlSchema).default([]),
    outline: z.array(OutlineSectionSchema).default([]),
    vocabulary: z.array(VocabularySchema).default([]),
  })
  .superRefine((pack, ctx) => {
    const intentIds = new Set(pack.intents.map((i) => i.id));
    pack.suggestions.forEach((s, index) => {
      if (s.intent && !intentIds.has(s.intent)) {
        ctx.addIssue({ code: "custom", path: ["suggestions", index, "intent"], message: `intention inconnue "${s.intent}"` });
      }
    });
  });

export type MachinePack = z.infer<typeof MachinePackSchema>;
export type Intent = z.infer<typeof IntentSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;
export type JournalEntry = z.infer<typeof JournalEntrySchema>;
export type Section = z.infer<typeof SectionSchema>;
export type Limit = z.infer<typeof LimitSchema>;
export type Control = z.infer<typeof ControlSchema>;
export type OutlineSection = z.infer<typeof OutlineSectionSchema>;
export type VocabularyEntry = z.infer<typeof VocabularySchema>;
