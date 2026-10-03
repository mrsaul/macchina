import "server-only";
import strongholdS7x from "../../../packs/stronghold-s7x.json";
import { MachinePackSchema, type MachinePack } from "./schema";

// Packs come from Git (packs/*.json), bundled at build time. Register new
// machines here. They are validated on first load, so a malformed pack fails
// loudly instead of rendering half a screen.
const RAW_PACKS: Record<string, unknown> = {
  "stronghold-s7x": strongholdS7x,
};

const cache = new Map<string, MachinePack>();

export function getPack(id: string): MachinePack | null {
  const cached = cache.get(id);
  if (cached) return cached;

  const raw = RAW_PACKS[id];
  if (!raw) return null;

  const result = MachinePackSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Pack "${id}" invalide :\n${result.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  if (result.data.id !== id) throw new Error(`Pack "${id}" : l'id du fichier vaut "${result.data.id}"`);

  cache.set(id, result.data);
  return result.data;
}
