import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIBusyError, AIUnavailableError, getLLMProvider } from "@/lib/ai";
import { buildClassifyPrompt, ClassificationSchema, finalizeClassification } from "@/lib/ai/classify";
import { createIntentLineParser } from "@/lib/ai/intent-line";
import { buildNarrateMessage, buildNarratePrompt, NarrationSchema, type Narration } from "@/lib/ai/narrate";
import { buildAnswerPrompt } from "@/lib/ai/prompt";
import { getMachineRole } from "@/lib/auth/machine-role";
import { getKnowledge } from "@/lib/knowledge-server";
import { checkLimits, hasValues, ReadingSchema, type LimitAlert, type Reading } from "@/lib/narration";
import { getPack } from "@/lib/packs";
import type { KnowledgeSection } from "@/lib/knowledge";
import type { MachinePack } from "@/lib/packs/schema";
import { rateLimit } from "@/lib/rate-limit";
import type { AnswerStreamEvent, ClassifyResponse } from "./events";

// POST /api/copilot — the only entry point to the language model.
//   mode "answer"   (any role, anonymous included): streamed answer grounded in the pack.
//   mode "classify" (contributor / maintainer): info | question | command, plus
//                   1–4 knowledge entries for "info", as strict JSON.
//   mode "narrate"  (signed-in users): short live comment on roast readings
//                   plus a safety level, as strict JSON. Advice only: nothing
//                   here can reach the machine.
// The API key stays on the server (ANTHROPIC_API_KEY, read by the provider).

const MAX_TURNS = 20;
const MAX_CHARS = 4000;
const WINDOW_MS = 10 * 60 * 1000;
// Per 10 minutes. Narration fires every ~20 s (30 per 10 min) plus manual requests.
const LIMITS = { anonymous: 10, authenticated: 60, classify: 30, narrate: 45 };
const MAX_PREVIOUS_READINGS = 10;

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
  z.object({
    mode: z.literal("narrate"),
    machineId: z.string().min(1),
    reading: ReadingSchema.refine(hasValues, { message: "au moins une mesure" }),
    previous: z.array(ReadingSchema).max(MAX_PREVIOUS_READINGS).default([]),
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

  const pack = await getPack(body.machineId);
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

  if (body.mode === "narrate") {
    // Signed-in only: a live session costs ~30 model calls per 10 minutes.
    if (!userId) return jsonError(401, "Connectez-vous pour utiliser la narration live.");
    const limit = rateLimit(`narrate:${userId}`, LIMITS.narrate, WINDOW_MS);
    if (!limit.ok) return tooMany(limit.retryAfterSeconds);
    return narrate(body.reading, body.previous, pack, request.signal);
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

const LIMIT_BREACH_MESSAGE = "Seuil documenté dépassé : arrête la chauffe et suis les consignes du constructeur.";

/** When the model is unavailable, a limit breach is still reported. */
function limitOnlyNarration(limitAlerts: LimitAlert[]): Narration {
  return { comment: "", safety: { level: "danger", message: LIMIT_BREACH_MESSAGE }, limitAlerts };
}

async function narrate(reading: Reading, previous: Reading[], pack: MachinePack, signal: AbortSignal) {
  // Hard limits are checked here, deterministically; the model is told about
  // breaches but cannot downgrade them.
  const limitAlerts = checkLimits(reading, pack.limits);
  try {
    const result = await getLLMProvider().generateJSON({
      system: buildNarratePrompt(pack, await getKnowledge(pack)),
      messages: [{ role: "user", content: buildNarrateMessage(reading, previous, limitAlerts) }],
      schema: NarrationSchema,
      effort: "low", // latency matters more than depth every 20 seconds
      signal,
    });
    if (!result.ok) {
      if (limitAlerts.length) {
        // The safety alert must reach the roaster even if the comment failed.
        return NextResponse.json(limitOnlyNarration(limitAlerts));
      }
      return jsonError(502, "Commentaire indisponible pour ce relevé.");
    }

    const narration: Narration = { ...result.data, limitAlerts };
    if (limitAlerts.length && narration.safety.level !== "danger") {
      narration.safety = {
        level: "danger",
        message: narration.safety.message || LIMIT_BREACH_MESSAGE,
      };
    }
    if (narration.safety.level === "none") narration.safety.message = "";
    return NextResponse.json(narration, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, message } = providerErrorMessage(error);
    if (limitAlerts.length) {
      return NextResponse.json(limitOnlyNarration(limitAlerts));
    }
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
