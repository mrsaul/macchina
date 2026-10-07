import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIBusyError, AIUnavailableError, getLLMProvider } from "@/lib/ai";
import {
  assembleStarterPack,
  buildGeneratePackMessage,
  buildGeneratePackPrompt,
  GeneratedPackSchema,
} from "@/lib/ai/generate-pack";
import { MACHINE_TYPE_IDS } from "@/lib/ontology";
import { rateLimit } from "@/lib/rate-limit";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// POST /api/machines — "Ajouter une machine".
// 1. the model proposes a starter structure for the machine type (no values);
// 2. create_machine() inserts the machine and makes the caller its maintainer,
//    atomically, with the caller's own session (no service key involved).

export const maxDuration = 60; // pack generation can take a few tens of seconds

const BodySchema = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  type: z.enum(MACHINE_TYPE_IDS),
  description: z.string().trim().max(280).default(""),
});

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) return jsonError(503, "Base de données non configurée.");

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Vérifiez la marque, le modèle et le type.");
  const input = parsed.data;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) return jsonError(401, "Connectez-vous pour ajouter une machine.");

  const { data: profile } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
  if (!profile?.username) return jsonError(403, "Choisis d'abord ton nom d'utilisateur (page Compte).");

  // The database also caps creations per day; this stops paying for a model
  // call that would then be refused.
  const limit = rateLimit(`machines:${userId}`, 5, 24 * 60 * 60 * 1000);
  if (!limit.ok) return jsonError(429, "Limite atteinte : 5 machines par jour.");

  let pack;
  try {
    const result = await getLLMProvider().generateJSON({
      system: buildGeneratePackPrompt(),
      messages: [{ role: "user", content: buildGeneratePackMessage(input) }],
      schema: GeneratedPackSchema,
      effort: "medium", // once per machine: structure quality matters more than speed
      signal: request.signal,
    });
    if (!result.ok) return jsonError(502, "La structure de la machine n'a pas pu être générée. Réessayez.");
    pack = assembleStarterPack(input, result.data);
  } catch (error) {
    if (error instanceof AIUnavailableError) return jsonError(503, "L'assistant n'est pas configuré sur ce serveur.");
    if (error instanceof AIBusyError) return jsonError(503, "L'assistant est momentanément surchargé. Réessayez.");
    console.error("[machines] pack generation failed:", error);
    return jsonError(500, "Une erreur est survenue. Réessayez.");
  }

  const { data: id, error } = await supabase.rpc("create_machine", {
    p_brand: input.brand,
    p_model: input.model,
    p_type: input.type,
    p_description: input.description,
    // A validated pack is plain JSON; the cast only bridges the generated Json type.
    p_pack: pack as unknown as Json,
  });
  if (error || !id) {
    if (error?.message.includes("too many machines")) return jsonError(429, "Limite atteinte : 5 machines par jour.");
    if (error?.message.includes("username")) return jsonError(403, "Choisis d'abord ton nom d'utilisateur (page Compte).");
    console.error("[machines] create_machine failed:", error?.message);
    return jsonError(500, "La machine n'a pas pu être créée. Réessayez.");
  }

  return NextResponse.json({ id }, { status: 201 });
}
