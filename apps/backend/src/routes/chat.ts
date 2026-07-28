import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/middleware.js";
import { getToolsForRole } from "../llm/tools/registry.js";
import { executeTool } from "../llm/tools/executor.js";
import { getLlmProvider } from "../llm/providers/index.js";
import { HttpError } from "../lib/errors.js";
import type { LlmMessage } from "../llm/provider.js";

const ChatHistoryTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const ChatBodySchema = z.object({
  message: z.string().min(1),
  /** Turnos previos visibles (sin toolResults) que el frontend reenvía para dar continuidad a la conversación. */
  history: z.array(ChatHistoryTurnSchema).max(40).optional(),
});

/**
 * Tope de rondas de tool-calling por turno de chat. La última ronda se
 * fuerza sin tools disponibles, para garantizar una respuesta final en
 * texto aunque el modelo quisiera seguir encadenando llamadas.
 */
const MAX_TOOL_ITERATIONS = 6;

/** Tope de turnos de historial reenviados al LLM, aplicado server-side sin importar cuánto mande el cliente. */
const MAX_HISTORY_TURNS = 20;

function buildSystemPrompt(role: string): string {
  return [
    "Sos el orquestador conversacional de NetBot, un agente que automatiza gestión de redes (UniFi/OPNsense).",
    `El usuario actual tiene el rol: ${role}.`,
    "Solo podés invocar las tools que se te ofrecen — ya están filtradas según ese rol.",
    "Nunca escribís configuración de red directamente: propose_vlan_plan solo genera un diff,",
    "y apply_vlan_plan encola el trabajo real, no lo ejecuta vos.",
    "Si el usuario pide algo para lo que no tenés una tool disponible dado su rol,",
    "explicá con claridad qué rol se necesita en vez de intentarlo.",
    "Podés encadenar varias tools en un mismo turno: por ejemplo, resolver un nombre de evento",
    "con list_events y después list_event_zones antes de responder — no le pidas al usuario IDs",
    "que podés averiguar vos mismo con las tools disponibles.",
  ].join(" ");
}

/**
 * chat-orchestrator: el único endpoint que conversa con el usuario. Nunca
 * ejecuta escrituras de red él mismo — delega en las tools (executor.ts),
 * que a su vez solo encolan trabajo real en remediation-queue cuando
 * corresponde. Dentro de un mismo turno encadena varias rondas de
 * tool-calling (ver MAX_TOOL_ITERATIONS) para poder resolver, por ejemplo,
 * un nombre de evento/zona antes de responder. No hay historial persistido
 * en el servidor entre turnos HTTP — el frontend reenvía los turnos previos
 * en `history` en cada request (ver ChatContext.tsx), y acá se los antepone
 * al mensaje nuevo para que el LLM tenga continuidad de la conversación.
 */
export async function chatRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.post("/chat", async (request, reply) => {
    const ctx = request.authContext!;
    const { message, history } = ChatBodySchema.parse(request.body);
    const tools = getToolsForRole(ctx.role);

    let provider;
    try {
      provider = getLlmProvider();
    } catch (err) {
      fastify.log.warn({ err }, "Proveedor LLM no disponible");
      return reply.send({
        mensaje:
          "El proveedor LLM no está configurado todavía (falta API key). Mientras tanto podés usar los endpoints REST directamente (/csv/upload, /vlan/reserve, /vlan/apply, /tickets, /network/status).",
        toolResults: [],
      });
    }

    const messages: LlmMessage[] = [
      { role: "system", content: buildSystemPrompt(ctx.role) },
      ...(history ?? []).slice(-MAX_HISTORY_TURNS).map((turn): LlmMessage => ({ role: turn.role, content: turn.content })),
      { role: "user", content: message },
    ];
    const toolResults: Array<{ tool: string; ok: boolean; output?: unknown; error?: string; statusCode?: number }> =
      [];

    let mensaje = "";
    try {
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const isLastIteration = iteration === MAX_TOOL_ITERATIONS - 1;
        const llmResult = await provider.chat({ messages, tools: isLastIteration ? [] : tools });
        messages.push(llmResult.message);

        if (llmResult.toolCalls.length === 0) {
          mensaje = llmResult.message.content;
          break;
        }

        for (const call of llmResult.toolCalls) {
          try {
            const output = await executeTool(call.name, call.arguments, ctx);
            toolResults.push({ tool: call.name, ok: true, output });
            messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify(output) });
          } catch (err) {
            if (err instanceof HttpError) {
              toolResults.push({ tool: call.name, ok: false, error: err.message, statusCode: err.statusCode });
              messages.push({
                role: "tool",
                toolCallId: call.id,
                name: call.name,
                content: JSON.stringify({ error: err.message }),
              });
              continue;
            }
            throw err;
          }
        }
      }
    } catch (err) {
      fastify.log.error({ err }, "Error durante el loop de tool-calling del chat");
      return reply.code(502).send({
        mensaje: "Hubo un error consultando al proveedor LLM. Intentá de nuevo.",
        toolResults,
      });
    }

    return reply.send({ mensaje, toolResults });
  });
}
