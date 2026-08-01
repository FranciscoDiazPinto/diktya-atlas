import { mkdirSync } from "node:fs";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import websocketPlugin from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { HttpError } from "./lib/errors.js";
import { LockAcquisitionError } from "./services/lock.service.js";
import { realtimeHub } from "./realtime/hub.js";
import { uploadsDir } from "./services/fileStorage.service.js";
import { authenticate } from "./auth/middleware.js";
import { authRoutes } from "./routes/auth.js";
import { csvRoutes } from "./routes/csv.js";
import { vlanRoutes } from "./routes/vlan.js";
import { networkRoutes } from "./routes/network.js";
import { ticketRoutes } from "./routes/tickets.js";
import { chatRoutes } from "./routes/chat.js";
import { venueRoutes } from "./routes/venues.js";
import { eventRoutes } from "./routes/events.js";
import { eventZoneRoutes } from "./routes/eventZones.js";
import { opnsenseRoutes } from "./routes/opnsense.js";
import { unifiOsRoutes } from "./routes/unifiOs.js";
import { reportRoutes } from "./routes/reports.js";

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
  // Default de @fastify/multipart es 1MiB por archivo — muy chico para
  // planos reales (los PDF de eventos observados llegan a varios MB).
  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  app.register(websocketPlugin);

  // Doc interactiva de la API (Swagger UI). Reusa los mismos schemas Zod que
  // cada ruta ya usa para `.parse()` a mano (ver lib/openapi.ts) — no cambia
  // la validación en runtime, es puramente documentación. Nunca montada en
  // producción: es superficie extra expuesta (lista completa de endpoints +
  // shapes) que no aporta nada a un usuario final.
  if (env.NODE_ENV !== "production") {
    app.register(swagger, {
      openapi: {
        info: {
          title: "NetBot API",
          description:
            "API del backend de Diktya Atlas / NetBot — gestión de redes de eventos (UniFi/OPNsense) orquestada por un LLM. " +
            "La mayoría de las rutas requiere `Authorization: Bearer <accessToken>` (ver POST /auth/login). " +
            "Los endpoints marcados sin candado son públicos.",
          version: "0.1.0",
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          },
        },
        tags: [
          { name: "Auth", description: "Login, 2FA (TOTP), refresh de sesión" },
          { name: "Chat", description: "Orquestador conversacional (LLM + tool-calling)" },
          { name: "CSV", description: "Ingesta de CSV -> plan de VLANs" },
          { name: "VLAN", description: "Reserva y aplicación de un plan de VLANs" },
          { name: "Red", description: "Estado UniFi (nodos, diagnóstico, reboot)" },
          { name: "Tickets", description: "Incidentes: creación, resolución, reapertura" },
          { name: "Reportes", description: "Digest de actividad y disponibilidad" },
          { name: "Infraestructura", description: "OPNsense y UniFi OS real — solo Admin" },
          { name: "Eventos", description: "Despliegues de evento (ej. \"Expomin 2026\")" },
          { name: "Zonas de evento", description: "Planos, calibración y APs por zona" },
          { name: "Venues", description: "Recintos y su plano base" },
        ],
      },
    });
    app.register(swaggerUi, { routePrefix: "/docs" });
  }

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Validación fallida", detalles: err.flatten() });
    }
    if (err instanceof LockAcquisitionError) {
      return reply.code(409).send({ error: "Ese recurso ya tiene una operación en curso, probá de nuevo en unos segundos" });
    }
    if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.code(413).send({ error: "El archivo supera el tamaño máximo permitido (50MB)" });
    }
    // @fastify/rate-limit tira un Error plano con `.statusCode = 429` (no una
    // clase distinguible por `instanceof`) — sin este caso caía al 500
    // genérico de abajo, indistinguible para el cliente de un error real
    // (confirmado en vivo: el frontend mostraba "Error interno" en vez de
    // avisar que había que esperar).
    const maybeRateLimitErr = err as { statusCode?: number; message?: string };
    if (maybeRateLimitErr.statusCode === 429) {
      return reply.code(429).send({ error: maybeRateLimitErr.message ?? "Demasiadas solicitudes" });
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

  // Planos de eventos (PDF/imagen): requieren sesión, igual que el resto de
  // la app — no son tan sensibles como credenciales, pero tampoco públicos.
  // @fastify/static exige que `root` exista al registrar el plugin (no
  // alcanza con crearlo recién al subir el primer archivo).
  mkdirSync(uploadsDir(), { recursive: true });
  app.register(async (fastify) => {
    fastify.addHook("preHandler", authenticate);
    fastify.register(fastifyStatic, { root: uploadsDir(), prefix: "/uploads/", decorateReply: false });
  });

  app.register(authRoutes);
  app.register(csvRoutes);
  app.register(vlanRoutes);
  app.register(networkRoutes);
  app.register(ticketRoutes);
  app.register(chatRoutes);
  app.register(venueRoutes);
  app.register(eventRoutes);
  app.register(eventZoneRoutes);
  app.register(opnsenseRoutes);
  app.register(unifiOsRoutes);
  app.register(reportRoutes);

  return app;
}
