import { z } from "zod";

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

export const MachinePackSchema = z
  .object({
    id: slug,
    brand: z.string().min(1),
    model: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "semver attendu"),
    status: z.enum(["draft", "published"]),
    language: z.string().min(2),
    description: z.string().optional(),
    sources: z.array(z.unknown()).default([]),
    sections: z.array(SectionSchema).default([]),
    intents: z.array(IntentSchema).default([]),
    suggestions: z.array(SuggestionSchema).default([]),
    journal: z.array(JournalEntrySchema).default([]),
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
