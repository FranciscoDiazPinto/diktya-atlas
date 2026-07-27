import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequestContext } from "../auth/context.js";
import { getToolsForRole } from "../llm/tools/registry.js";
import { executeTool } from "../llm/tools/executor.js";
import { getLlmProvider } from "../llm/providers/index.js";
import { HttpError } from "../lib/errors.js";

const ChatBodySchema = z.object({ message: z.string().min(1) });

function buildSystemPrompt(role: string): string {
  return [
    "Sos el orquestador conversacional de NetBot, un agente que automatiza gestión de redes (UniFi/OPNsense).",
    `El usuario actual tiene el rol: ${role}.`,
    "Solo podés invocar las tools que se te ofrecen — ya están filtradas según ese rol.",
    "Nunca escribís configuración de red directamente: propose_vlan_plan solo genera un diff,",
    "y apply_vlan_plan encola el trabajo real, no lo ejecuta vos.",
    "Si el usuario pide algo para lo que no tenés una tool disponible dado su rol,",
    "explicá con claridad qué rol se necesita en vez de intentarlo.",
  ].join(" ");
}

/**
 * chat-orchestrator: el único endpoint que conversa con el usuario. Nunca
 * ejecuta escrituras de red él mismo — delega en las tools (executor.ts),
 * que a su vez solo encolan trabajo real en remediation-queue cuando
 * corresponde. Sin historial persistente todavía (single-turn): la
 * conversación por sesión es un deliverable del prompt de frontend.
 */
export async function chatRoutes(fastify: FastifyInstance) {
  fastify.post("/chat", async (request, reply) => {
    const ctx = getRequestContext(request);
    const { message } = ChatBodySchema.parse(request.body);
    const tools = getToolsForRole(ctx.role);

    let llmResult;
    try {
      const provider = getLlmProvider();
      llmResult = await provider.chat({
        messages: [
          { role: "system", content: buildSystemPrompt(ctx.role) },
          { role: "user", content: message },
        ],
        tools,
      });
    } catch (err) {
      fastify.log.warn({ err }, "Proveedor LLM no disponible");
      return reply.send({
        mensaje:
          "El proveedor LLM no está configurado todavía (falta API key). Mientras tanto podés usar los endpoints REST directamente (/csv/upload, /vlan/reserve, /vlan/apply, /tickets, /network/status).",
        toolResults: [],
      });
    }

    const toolResults = [];
    for (const call of llmResult.toolCalls) {
      try {
        const output = await executeTool(call.name, call.arguments, ctx);
        toolResults.push({ tool: call.name, ok: true, output });
      } catch (err) {
        if (err instanceof HttpError) {
          toolResults.push({ tool: call.name, ok: false, error: err.message, statusCode: err.statusCode });
          continue;
        }
        throw err;
      }
    }

    return reply.send({ mensaje: llmResult.message.content, toolResults });
  });
}
