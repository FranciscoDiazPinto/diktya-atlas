import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import websocketPlugin from "@fastify/websocket";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { HttpError } from "./lib/errors.js";
import { realtimeHub } from "./realtime/hub.js";
import { authRoutes } from "./routes/auth.js";
import { csvRoutes } from "./routes/csv.js";
import { vlanRoutes } from "./routes/vlan.js";
import { networkRoutes } from "./routes/network.js";
import { ticketRoutes } from "./routes/tickets.js";
import { chatRoutes } from "./routes/chat.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: env.NODE_ENV !== "test" });

  // El frontend (Vite, otro puerto) necesita CORS habilitado para poder
  // llamar a la API en dev, con credentials para que viaje la cookie de
  // refresh. En producción esto apunta al dominio real detrás del reverse
  // proxy (ver SECURITY.md).
  app.register(cors, {
    origin: env.FRONTEND_ORIGIN.split(","),
    credentials: true,
  });
  app.register(cookie);
  // Default generoso a nivel global; /auth/login y /auth/login/verify-totp
  // tienen un límite propio más estricto (ver routes/auth.ts) para frenar
  // fuerza bruta sin castigar el resto de la API.
  app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
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

  // El WebSocket de tiempo real no pasa por `authenticate` todavía: los
  // browsers no pueden mandar headers custom en el handshake de WS, así
  // que autenticarlo requeriría un mecanismo aparte (token por query param).
  // Queda documentado como pendiente en SECURITY.md, no implementado en
  // silencio.
  app.register(async (fastify) => {
    fastify.get("/ws", { websocket: true }, (socket) => {
      realtimeHub.addClient(socket);
    });
  });

  app.register(authRoutes);
  app.register(csvRoutes);
  app.register(vlanRoutes);
  app.register(networkRoutes);
  app.register(ticketRoutes);
  app.register(chatRoutes);

  return app;
}
