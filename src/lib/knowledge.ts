import type { Section } from "@/lib/packs/schema";

// The knowledge base of a machine = the locked pack sections (Git) plus the
// contributions maintainers approved (Supabase). Shared by the Journal and
// the prompts so both see the same base.

export type SourceType = "contributor" | "manual" | "document";

export type ApprovedEntry = {
  id: string;
  section: string;
  text: string;
  safety: boolean;
  sourceType: SourceType;
  /** Who or what the knowledge comes from: "Saul", "Aude", "Manuel du moulin". */
  sourceLabel: string | null;
};

/** A source as shown under an answer. "reference" = the locked pack (Git). */
export type AnswerSource = { label: string; type: SourceType | "reference" };

export type KnowledgeSection = {
  id: string;
  title: string;
  /** Pack section, versioned in Git: read-only in the app. */
  locked: Section | null;
  approved: ApprovedEntry[];
  safety: boolean;
};

/** "reglages-ventilation" → "Reglages ventilation" (accents are lost in slugs). */
export function humanizeSlug(slug: string) {
  const words = slug.replace(/-+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : slug;
}

/** Pack sections first (in pack order), then sections only contributions use. */
export function buildKnowledge(packSections: Section[], approved: ApprovedEntry[]): KnowledgeSection[] {
  const byId = new Map<string, KnowledgeSection>();
  for (const s of packSections) {
    byId.set(s.id, { id: s.id, title: s.title, locked: s, approved: [], safety: s.safety });
  }
  for (const entry of approved) {
    let section = byId.get(entry.section);
    if (!section) {
      section = { id: entry.section, title: humanizeSlug(entry.section), locked: null, approved: [], safety: false };
      byId.set(entry.section, section);
    }
    section.approved.push(entry);
    section.safety ||= entry.safety;
  }
  return [...byId.values()];
}
