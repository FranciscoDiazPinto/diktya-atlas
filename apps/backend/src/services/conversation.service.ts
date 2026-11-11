import { randomUUID } from "node:crypto";
import { prisma } from "../db/client.js";
import type { RequestContext } from "../auth/context.js";
import { HttpError } from "../lib/errors.js";

export async function authorizeChat(ctx: RequestContext) {
  const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
  if (!user || user.role !== ctx.role) throw new HttpError(403, "Tu acceso cambió. Inicia sesión nuevamente.");
}

export async function ownedConversation(ctx: RequestContext, id: string) {
  await authorizeChat(ctx);
  const conversation = await prisma.conversation.findFirst({ where: { id, userId: ctx.userId, role: ctx.role } });
  if (!conversation) throw new HttpError(404, "Conversación no encontrada");
  return conversation;
}

export async function claimTurn(ctx: RequestContext, id: string, version: number) {
  await ownedConversation(ctx, id);
  const token = randomUUID();
  const result = await prisma.conversation.updateMany({
    where: { id, userId: ctx.userId, role: ctx.role, version, pendingTurn: null },
    data: { pendingTurn: token },
  });
  if (!result.count) throw new HttpError(409, "La conversación cambió o tiene una respuesta pendiente. Recárgala.");
  return token;
}

export async function releaseTurn(id: string, token: string) {
  await prisma.conversation.updateMany({ where: { id, pendingTurn: token }, data: { pendingTurn: null } });
}

export async function saveExchange(ctx: RequestContext, id: string, version: number, token: string, message: string, answer: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: ctx.userId } });
    if (!user || user.role !== ctx.role) throw new HttpError(403, "Tu acceso cambió durante la consulta.");
    const result = await tx.conversation.updateMany({
      where: { id, userId: ctx.userId, role: ctx.role, version, pendingTurn: token },
      data: { version: { increment: 1 }, pendingTurn: null, ...(version === 0 ? { title: message.slice(0, 100) } : {}) },
    });
    if (!result.count) throw new HttpError(409, "La conversación cambió durante la consulta.");
    await tx.chatMessage.createMany({ data: [
      { conversationId: id, sequence: version * 2, role: "user", content: message },
      { conversationId: id, sequence: version * 2 + 1, role: "assistant", content: answer },
    ] });
    return version + 1;
  });
}
