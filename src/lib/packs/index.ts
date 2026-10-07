import "server-only";
import strongholdS7x from "../../../packs/stronghold-s7x.json";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { MachinePackSchema, type MachinePack } from "./schema";

// Two sources of packs, one schema:
// - curated packs, versioned in Git (packs/*.json) and bundled at build time —
//   they win for their ids;
// - packs of machines created in the app ("Ajouter une machine"), stored in
//   machines.pack and read per request.
const GIT_PACKS: Record<string, unknown> = {
  "stronghold-s7x": strongholdS7x,
};

const gitCache = new Map<string, MachinePack>();

function parsePack(id: string, raw: unknown): MachinePack {
  const result = MachinePackSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Pack "${id}" invalide :\n${result.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  if (result.data.id !== id) throw new Error(`Pack "${id}" : l'id du pack vaut "${result.data.id}"`);
  return result.data;
}

export function isGitPack(id: string) {
  return id in GIT_PACKS;
}

export async function getPack(id: string): Promise<MachinePack | null> {
  if (isGitPack(id)) {
    const cached = gitCache.get(id) ?? parsePack(id, GIT_PACKS[id]);
    gitCache.set(id, cached);
    return cached;
  }
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.from("machines").select("pack").eq("id", id).maybeSingle();
  if (error || !data) return null;
  try {
    return parsePack(id, data.pack);
  } catch (e) {
    // A broken stored pack must not take the page down: treat it as missing.
    console.error(`[packs] ${(e as Error).message}`);
    return null;
  }
}
