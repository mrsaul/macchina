import "server-only";
import { buildKnowledge, type KnowledgeSection } from "@/lib/knowledge";
import type { MachinePack } from "@/lib/packs/schema";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Knowledge base the model may use: locked pack sections + approved
 * contributions. Approved rows are public under RLS, so the caller's own
 * client is enough. If Supabase is unreachable, fall back to the pack alone.
 */
export async function getKnowledge(pack: MachinePack): Promise<KnowledgeSection[]> {
  if (!isSupabaseConfigured) return buildKnowledge(pack.sections, []);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contributions")
    .select("id, section, text, safety")
    .eq("machine_id", pack.id)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (error) console.error("[knowledge] approved contributions unavailable:", error.message);
  return buildKnowledge(
    pack.sections,
    (data ?? []).map((row) => ({ ...row, section: row.section ?? "divers" })),
  );
}
