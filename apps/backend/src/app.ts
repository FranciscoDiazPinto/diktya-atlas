import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocketPlugin from "@fastify/websocket";
import { ZodError } from "zod";
import { HttpError } from "./lib/errors.js";
import { realtimeHub } from "./realtime/hub.js";
import { csvRoutes } from "./routes/csv.js";
import { vlanRoutes } from "./routes/vlan.js";
import { networkRoutes } from "./routes/network.js";
import { ticketRoutes } from "./routes/tickets.js";
import { chatRoutes } from "./routes/chat.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  // El frontend (Vite, otro puerto) necesita CORS habilitado para poder
  // llamar a la API en dev. En producción esto se restringe al dominio
  // real detrás del reverse proxy (ver prompt de seguridad).
  app.register(cors, {
    origin: (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173").split(","),
    credentials: true,
  });
  app.register(multipart);
  app.register(websocketPlugin);

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Validación fallida", detalles: err.flatten() });
    }
    app.log.error(err);
    return reply.code(500).send({ error: "Error interno" });
  });

  app.get("/health", async () => ({ ok: true }));

  app.register(async (fastify) => {
    fastify.get("/ws", { websocket: true }, (socket) => {
      realtimeHub.addClient(socket);
    });
  });

  app.register(csvRoutes);
  app.register(vlanRoutes);
  app.register(networkRoutes);
  app.register(ticketRoutes);
  app.register(chatRoutes);

  return app;
}
