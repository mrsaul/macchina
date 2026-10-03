import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIBusyError, AIUnavailableError, getAIProvider } from "@/lib/ai";
import { createIntentLineParser } from "@/lib/ai/intent-line";
import { buildSystemPrompt } from "@/lib/ai/prompt";
import { getPack } from "@/lib/packs";
import { rateLimit } from "@/lib/rate-limit";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { ChatStreamEvent } from "./events";

const MAX_TURNS = 20;
const MAX_CHARS = 4000;
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = { anonymous: 10, authenticated: 60 }; // requests per 10 minutes

const BodySchema = z.object({
  machineId: z.string().min(1),
  turns: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(MAX_CHARS) }))
    .min(1)
    .max(MAX_TURNS)
    // Zod 4 still runs this refine when .min(1) failed, so guard the empty array.
    .refine((turns) => turns[0]?.role === "user" && turns.at(-1)?.role === "user", {
      message: "la conversation doit commencer et finir par une question",
    }),
});

function errorResponse(status: number, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

async function getUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "Requête invalide.");
  const { machineId, turns } = parsed.data;

  const pack = getPack(machineId);
  if (!pack) return errorResponse(404, "Machine inconnue.");

  // Anonymous reading is allowed (CLAUDE.md), so the limit is per IP for
  // visitors and per account, more generous, for signed-in users.
  const userId = await getUserId();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = rateLimit(userId ? `user:${userId}` : `ip:${ip}`, userId ? LIMITS.authenticated : LIMITS.anonymous, WINDOW_MS);
  if (!limit.ok) {
    return errorResponse(429, "Trop de questions d'affilée. Réessayez dans quelques minutes.", {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  const provider = getAIProvider();
  const system = buildSystemPrompt(pack);
  const parser = createIntentLineParser(pack.intents.map((i) => i.id));
  const encoder = new TextEncoder();

  // NDJSON stream: one ChatStreamEvent per line.
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const forward = ({ intents, text }: { intents: string[] | null; text: string }) => {
        if (intents) send({ type: "intents", ids: intents });
        if (text) send({ type: "text", text });
      };

      try {
        for await (const event of provider.streamAnswer({ system, turns, signal: request.signal })) {
          if (event.type === "text") forward(parser.push(event.text));
          else {
            forward(parser.flush());
            send({ type: "done", stopReason: event.stopReason });
          }
        }
      } catch (error) {
        if (request.signal.aborted) return controller.close();
        if (error instanceof AIUnavailableError) {
          console.error("[chat] assistant unavailable:", error.message);
          send({ type: "error", message: "L'assistant n'est pas configuré sur ce serveur." });
        } else if (error instanceof AIBusyError) {
          send({ type: "error", message: "L'assistant est momentanément surchargé. Réessayez dans un instant." });
        } else {
          console.error("[chat] unexpected error:", error);
          send({ type: "error", message: "Une erreur est survenue. Réessayez." });
        }
      }
      controller.close();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
