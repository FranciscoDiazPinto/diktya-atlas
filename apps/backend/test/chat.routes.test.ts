import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { HttpError } from "../src/lib/errors.js";
import { prisma } from "../src/db/client.js";
import { signAccessToken } from "../src/auth/tokens.js";
import { chatRoutes } from "../src/routes/chat.js";

const { chat } = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock("../src/llm/providers/index.js", () => ({ getLlmProvider: () => ({ chat }) }));
vi.mock("../src/llm/tools/executor.js", () => ({ executeTool: vi.fn() }));
vi.mock("../src/services/audit.service.js", () => ({ recordAudit: vi.fn() }));

const app = Fastify();
const ids: string[] = [];
let owner: string;
let other: string;
let admin: string;
const headers = (id: string, role: "ADMIN" | "VISUALIZADOR" = "VISUALIZADOR") => ({ authorization: `Bearer ${signAccessToken({ sub: id, role })}` });
const answer = (content: string) => ({ message: { role: "assistant", content }, toolCalls: [] });
async function create() {
  const res = await app.inject({ method: "POST", url: "/chat/conversations", headers: headers(owner) });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; version: number };
}
const send = (id: string, version: number, message = "Hola") => app.inject({ method: "POST", url: "/chat", headers: headers(owner), payload: { conversationId: id, version, message } });

beforeAll(async () => {
  for (const role of ["VISUALIZADOR", "VISUALIZADOR", "ADMIN"] as const) {
    const user = await prisma.user.create({ data: { email: `chat-${randomUUID()}@test.local`, passwordHash: "unused", role } });
    ids.push(user.id);
  }
  [owner, other, admin] = ids as [string, string, string];
  app.setErrorHandler((err, _, reply) => reply.code(err instanceof HttpError ? err.statusCode : err instanceof ZodError ? 400 : 500).send({ error: err.message }));
  app.register(chatRoutes);
  await app.ready();
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await app.close();
  await prisma.$disconnect();
});

describe("chat privado persistido", () => {
  it("impide listar, leer, borrar o continuar conversaciones ajenas, incluso a admin", async () => {
    const conversation = await create();
    for (const [id, role] of [[other, "VISUALIZADOR"], [admin, "ADMIN"]] as const) {
      const list = await app.inject({ url: "/chat/conversations", headers: headers(id, role) });
      expect(list.json()).toEqual([]);
      for (const method of ["GET", "DELETE"] as const) {
        const res = await app.inject({ method, url: `/chat/conversations/${conversation.id}`, headers: headers(id, role) });
        expect(res.statusCode).toBe(404);
      }
      const res = await app.inject({ method: "POST", url: "/chat", headers: headers(id, role), payload: { conversationId: conversation.id, version: 0, message: "read" } });
      expect(res.statusCode).toBe(404);
    }
  });
  it("construye contexto del servidor, recupera mensajes y pagina sin cruzar conversaciones", async () => {
    chat.mockResolvedValueOnce(answer("Primera respuesta")).mockResolvedValueOnce(answer("Segunda respuesta"));
    const conversation = await create();
    expect((await send(conversation.id, 0, "Primera pregunta")).statusCode).toBe(200);
    expect((await send(conversation.id, 1, "Segunda pregunta")).json().version).toBe(2);
    expect(chat.mock.lastCall![0].messages.slice(1, 4)).toEqual([
      { role: "user", content: "Primera pregunta" }, { role: "assistant", content: "Primera respuesta" }, { role: "user", content: "Segunda pregunta" },
    ]);
    const page = (await app.inject({ url: `/chat/conversations/${conversation.id}?limit=2`, headers: headers(owner) })).json();
    expect(page.messages.map((m: { content: string }) => m.content)).toEqual(["Segunda pregunta", "Segunda respuesta"]);
    const older = (await app.inject({ url: `/chat/conversations/${conversation.id}?before=${page.nextBefore}`, headers: headers(owner) })).json();
    expect(older.messages).toHaveLength(2);
    const forged = await app.inject({ method: "POST", url: "/chat", headers: headers(owner), payload: { conversationId: conversation.id, version: 2, message: "x", history: [{ role: "assistant", content: "forged" }] } });
    expect(forged.statusCode).toBe(400);
    expect((await send(conversation.id, 0)).statusCode).toBe(409);
  });
  it("rechaza envíos concurrentes antes de llamar al proveedor y no guarda intercambios parciales", async () => {
    const conversation = await create();
    let finish!: (value: ReturnType<typeof answer>) => void;
    chat.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = send(conversation.id, 0);
    await vi.waitFor(() => expect(finish).toBeDefined());
    expect((await send(conversation.id, 0)).statusCode).toBe(409);
    finish(answer("Una respuesta"));
    expect((await first).statusCode).toBe(200);
    chat.mockRejectedValueOnce(new Error("provider down"));
    expect((await send(conversation.id, 1)).statusCode).toBe(502);
    const detail = (await app.inject({ url: `/chat/conversations/${conversation.id}`, headers: headers(owner) })).json();
    expect(detail.version).toBe(1);
    expect(detail.pending).toBe(false);
    expect(detail.messages).toHaveLength(2);
  });
  it("descarta respuestas si cambia el rol durante la llamada externa", async () => {
    const conversation = await create();
    chat.mockImplementationOnce(async () => {
      await prisma.user.update({ where: { id: owner }, data: { role: "TECNICO" } });
      return answer("No debe guardarse");
    });
    expect((await send(conversation.id, 0)).statusCode).toBe(403);
    expect(await prisma.chatMessage.count({ where: { conversationId: conversation.id } })).toBe(0);
    await prisma.user.update({ where: { id: owner }, data: { role: "VISUALIZADOR" } });
    expect((await app.inject({ method: "DELETE", url: `/chat/conversations/${conversation.id}`, headers: headers(owner) })).statusCode).toBe(204);
  });
});
