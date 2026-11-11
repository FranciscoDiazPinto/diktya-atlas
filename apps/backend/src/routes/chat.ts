import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth/middleware.js";
import { getToolsForRole } from "../llm/tools/registry.js";
import { executeTool } from "../llm/tools/executor.js";
import { getLlmProvider } from "../llm/providers/index.js";
import { HttpError } from "../lib/errors.js";
import { routeDocs } from "../lib/openapi.js";
import { prisma } from "../db/client.js";
import { authorizeChat, ownedConversation, claimTurn, releaseTurn, saveExchange } from "../services/conversation.service.js";
import type { LlmMessage } from "../llm/provider.js";

const ChatBodySchema = z.object({
  message: z.string().trim().min(1).max(12000),
  conversationId: z.string().min(1),
  version: z.number().int().nonnegative(),
}).strict();

/**
 * Tope de rondas de tool-calling por turno de chat. La última ronda se
 * fuerza sin tools disponibles, para garantizar una respuesta final en
 * texto aunque el modelo quisiera seguir encadenando llamadas.
 */
const MAX_TOOL_ITERATIONS = 6;

/** Tope de turnos de historial enviados al LLM desde el almacenamiento privado del servidor. */
const MAX_HISTORY_TURNS = 20;

function buildSystemPrompt(role: string): string {
  return [
    "Sos el orquestador conversacional de NetBot, un agente que automatiza gestión de redes (UniFi/OPNsense).",
    `El usuario actual tiene el rol: ${role}.`,
    "Solo podés invocar las tools que se te ofrecen — ya están filtradas según ese rol.",
    "propose_vlan_plan solo prepara una propuesta. No podés reservar, aprobar ni aplicar cambios de red.",
    "El usuario debe abrir el plan y confirmar explícitamente cada cambio desde la interfaz.",
    "Si el usuario pide algo para lo que no tenés una tool disponible dado su rol,",
    "explicá con claridad qué rol se necesita en vez de intentarlo.",
    "Podés encadenar varias tools en un mismo turno: por ejemplo, resolver un nombre de evento",
    "con list_events y después list_event_zones antes de responder — no le pidas al usuario IDs",
    "que podés averiguar vos mismo con las tools disponibles.",
  ].join(" ");
}

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);
  fastify.addHook("onRequest", async (_request, reply) => {
    reply.header("Cache-Control", "no-store, private");
  });

  fastify.get("/chat/conversations", async (request) => {
    const ctx = request.authContext!;
    await authorizeChat(ctx);
    const { offset, limit } = z.object({
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }).parse(request.query);
    return prisma.conversation.findMany({
      where: { userId: ctx.userId, role: ctx.role },
      select: { id: true, title: true, version: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: offset, take: limit,
    });
  });
  fastify.post("/chat/conversations", async (request, reply) => {
    const ctx = request.authContext!;
    await authorizeChat(ctx);
    const conversation = await prisma.conversation.create({ data: { userId: ctx.userId, role: ctx.role } });
    return reply.code(201).send({ id: conversation.id, title: conversation.title, version: conversation.version });
  });
  fastify.get<{ Params: { id: string } }>("/chat/conversations/:id", async (request) => {
    const conversation = await ownedConversation(request.authContext!, request.params.id);
    const { before, limit } = z.object({
      before: z.coerce.number().int().nonnegative().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(100),
    }).parse(request.query);
    const rows = await prisma.chatMessage.findMany({
      where: { conversationId: conversation.id, ...(before !== undefined ? { sequence: { lt: before } } : {}) },
      orderBy: { sequence: "desc" }, take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).reverse();
    return { id: conversation.id, title: conversation.title, version: conversation.version,
      pending: conversation.pendingTurn !== null, messages, nextBefore: hasMore ? messages[0]!.sequence : null };
  });
  fastify.delete<{ Params: { id: string } }>("/chat/conversations/:id", async (request, reply) => {
    await ownedConversation(request.authContext!, request.params.id);
    await prisma.conversation.deleteMany({ where: { id: request.params.id, userId: request.authContext!.userId } });
    return reply.code(204).send();
  });

  fastify.post(
    "/chat",
    {
      attachValidation: true,
      // Rechazar campos de identidad/historial antes de que AJV elimine extras.
      preValidation: async (request) => { ChatBodySchema.parse(request.body); },
      schema: routeDocs({
        summary: "Enviar un mensaje al orquestador conversacional",
        description:
          "Encadena hasta 6 rondas de tool-calling con las tools filtradas según el rol del usuario " +
          "(`toolResults` trae cada llamada, éxito/error). El historial privado se construye en el servidor; requiere conversationId y version.",
        tags: ["Chat"],
        body: ChatBodySchema,
      }),
    },
    async (request, reply) => {
      const ctx = request.authContext!;
      const { message, conversationId, version } = ChatBodySchema.parse(request.body);
      await ownedConversation(ctx, conversationId);
      const tools = getToolsForRole(ctx.role);

      let provider;
      try {
        provider = getLlmProvider();
      } catch (err) {
        fastify.log.warn({ err }, "Proveedor LLM no disponible");
        throw new HttpError(503, "El proveedor LLM no está configurado.");
      }

      const token = await claimTurn(ctx, conversationId, version);
      try {
        const history = (await prisma.chatMessage.findMany({
          where: { conversationId }, orderBy: { sequence: "desc" }, take: MAX_HISTORY_TURNS,
        })).reverse();
        const messages: LlmMessage[] = [
          { role: "system", content: buildSystemPrompt(ctx.role) },
          ...history.map((turn): LlmMessage => ({ role: turn.role as "user" | "assistant", content: turn.content })),
          { role: "user", content: message },
        ];
        const toolResults: Array<{ tool: string; ok: boolean; output?: unknown; error?: string; statusCode?: number }> =
          [];

        let mensaje = "";
        try {
          for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
            const isLastIteration = iteration === MAX_TOOL_ITERATIONS - 1;
            await ownedConversation(ctx, conversationId);
            const llmResult = await provider.chat({ messages, tools: isLastIteration ? [] : tools });
            messages.push(llmResult.message);

            if (llmResult.toolCalls.length === 0) {
              mensaje = llmResult.message.content;
              break;
            }

            for (const call of llmResult.toolCalls) {
              try {
                await ownedConversation(ctx, conversationId);
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
            error: "Hubo un error consultando al proveedor LLM. Intentá de nuevo.",
          });
        }

        if (!mensaje.trim()) throw new HttpError(502, "El proveedor no devolvió una respuesta. Intenta nuevamente.");
        const nextVersion = await saveExchange(ctx, conversationId, version, token, message, mensaje);
        return reply.send({ mensaje, toolResults, conversationId, version: nextVersion });
      } finally {
        await releaseTurn(conversationId, token);
      }
    }
  );
}
