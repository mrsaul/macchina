import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIBusyError, AIUnavailableError, getLLMProvider } from "@/lib/ai";
import { buildClassifyPrompt, ClassificationSchema, finalizeClassification } from "@/lib/ai/classify";
import { createIntentLineParser } from "@/lib/ai/intent-line";
import { buildAnswerPrompt } from "@/lib/ai/prompt";
import { getMachineRole } from "@/lib/auth/machine-role";
import { getKnowledge } from "@/lib/knowledge-server";
import { getPack } from "@/lib/packs";
import type { KnowledgeSection } from "@/lib/knowledge";
import type { MachinePack } from "@/lib/packs/schema";
import { rateLimit } from "@/lib/rate-limit";
import type { AnswerStreamEvent, ClassifyResponse } from "./events";

// POST /api/copilot — the only entry point to the language model.
//   mode "answer"   (any role, anonymous included): streamed answer grounded in the pack.
//   mode "classify" (contributor / maintainer): info | question | command, plus
//                   1–4 knowledge entries for "info", as strict JSON.
// The API key stays on the server (ANTHROPIC_API_KEY, read by the provider).

const MAX_TURNS = 20;
const MAX_CHARS = 4000;
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = { anonymous: 10, authenticated: 60, classify: 30 }; // per 10 minutes

const Turn = z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(MAX_CHARS) });

const BodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("answer"),
    machineId: z.string().min(1),
    turns: z
      .array(Turn)
      .min(1)
      .max(MAX_TURNS)
      // Zod 4 still runs this refine when .min(1) failed, so guard the empty array.
      .refine((turns) => turns[0]?.role === "user" && turns.at(-1)?.role === "user", {
        message: "la conversation doit commencer et finir par une question",
      }),
  }),
  z.object({
    mode: z.literal("classify"),
    machineId: z.string().min(1),
    message: z.string().trim().min(1).max(MAX_CHARS),
  }),
]);

function jsonError(status: number, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: message }, { status, headers });
}

function tooMany(retryAfterSeconds: number) {
  return jsonError(429, "Trop de demandes d'affilée. Réessayez dans quelques minutes.", {
    "Retry-After": String(retryAfterSeconds),
  });
}

function providerErrorMessage(error: unknown) {
  if (error instanceof AIUnavailableError) {
    console.error("[copilot] model unavailable:", error.message);
    return { status: 503, message: "L'assistant n'est pas configuré sur ce serveur." };
  }
  if (error instanceof AIBusyError) {
    return { status: 503, message: "L'assistant est momentanément surchargé. Réessayez dans un instant." };
  }
  console.error("[copilot] unexpected error:", error);
  return { status: 500, message: "Une erreur est survenue. Réessayez." };
}

export async function POST(request: NextRequest) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "Requête invalide.");
  const body = parsed.data;

  const pack = getPack(body.machineId);
  if (!pack) return jsonError(404, "Machine inconnue.");

  const { userId, role } = await getMachineRole(pack.id);

  if (body.mode === "classify") {
    if (!userId) return jsonError(401, "Connectez-vous pour contribuer.");
    if (role !== "contributor" && role !== "maintainer") {
      return jsonError(403, "Réservé aux contributeurs et mainteneurs de cette machine.");
    }
    const limit = rateLimit(`classify:${userId}`, LIMITS.classify, WINDOW_MS);
    if (!limit.ok) return tooMany(limit.retryAfterSeconds);
    return classify(body.message, pack, request.signal);
  }

  // Anonymous reading is allowed (CLAUDE.md): limit per IP for visitors and
  // per account, more generous, for signed-in users.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = rateLimit(
    userId ? `user:${userId}` : `ip:${ip}`,
    userId ? LIMITS.authenticated : LIMITS.anonymous,
    WINDOW_MS,
  );
  if (!limit.ok) return tooMany(limit.retryAfterSeconds);
  return answer(body.turns, pack, await getKnowledge(pack), request.signal);
}

async function classify(message: string, pack: MachinePack, signal: AbortSignal) {
  try {
    const result = await getLLMProvider().generateJSON({
      system: buildClassifyPrompt(pack, await getKnowledge(pack)),
      // The message is data: fenced, and a closing tag inside it is neutralized.
      messages: [{ role: "user", content: `<message>\n${message.replaceAll("</message>", "</ message>")}\n</message>` }],
      schema: ClassificationSchema,
      effort: "low",
      signal,
    });

    if (!result.ok) {
      if (result.reason === "refusal") return jsonError(422, "Ce message ne peut pas être traité.");
      return jsonError(502, "La classification a échoué. Réessayez.");
    }
    const classification = finalizeClassification(result.data, pack);
    if (!classification) return jsonError(502, "Aucune information exploitable n'a pu être extraite. Reformulez.");
    return NextResponse.json(classification satisfies ClassifyResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, message } = providerErrorMessage(error);
    return jsonError(status, message);
  }
}

function answer(
  turns: { role: "user" | "assistant"; content: string }[],
  pack: MachinePack,
  knowledge: KnowledgeSection[],
  signal: AbortSignal,
) {
  const provider = getLLMProvider();
  const parser = createIntentLineParser(pack.intents.map((i) => i.id));
  const encoder = new TextEncoder();

  // NDJSON stream: one AnswerStreamEvent per line. Errors after the stream
  // started travel as an "error" event, since the status is already sent.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnswerStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const forward = ({ intents, text }: { intents: string[] | null; text: string }) => {
        if (intents) send({ type: "intents", ids: intents });
        if (text) send({ type: "text", text });
      };

      try {
        for await (const event of provider.generate({ system: buildAnswerPrompt(pack, knowledge), messages: turns, signal })) {
          if (event.type === "text") forward(parser.push(event.text));
          else {
            forward(parser.flush());
            send({ type: "done", stopReason: event.stopReason });
          }
        }
      } catch (error) {
        if (!signal.aborted) send({ type: "error", message: providerErrorMessage(error).message });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
