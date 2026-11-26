import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getNetworkStatusSummary,
  getLiveWifiNetworks,
  getApDetail,
  diagnoseNode,
  rebootNode,
} from "../services/network.service.js";
import { authenticate, requireRole } from "../auth/middleware.js";
import { getUnifiClient } from "../integrations/unifi/index.js";
import { env } from "../config/env.js";
import { authorizeNetworkChange } from "../services/planDiff.service.js";
import { previewWifiPlan, WifiPlanPreviewSchema } from "../services/wifiPlanPreview.service.js";
import { routeDocs } from "../lib/openapi.js";

const StatusQuerySchema = z.object({ sitio: z.string().optional() });
const NodeIdParamSchema = z.object({ id: z.string() });

export async function networkRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  // Cualquier rol autenticado puede leer estado de red (incl. VISUALIZADOR).
  fastify.get(
    "/network/status",
    {
      attachValidation: true,
      schema: routeDocs({
        summary: "Estado UniFi: nodos + alertas recientes",
        description: "Lee de Postgres (sincronizado por worker-monitor), no en vivo del controlador.",
        tags: ["Red"],
        querystring: StatusQuerySchema,
      }),
    },
    async (request, reply) => {
      const { sitio } = StatusQuerySchema.parse(request.query);
      return reply.send(await getNetworkStatusSummary(sitio));
    }
  );

  // Consulta activa a UniFi (no Postgres — esa tabla no la sincroniza nadie
  // todavía) — mismo criterio de rol que /network/nodes/:id/diagnose:
  // dispara tráfico real contra el equipo, no es un GET de caché.
  fastify.get(
    "/network/wifi-networks/live",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      attachValidation: true,
      schema: routeDocs({
        summary: "VLANs (SSIDs) reales del sitio, en vivo",
        description: "Consulta directa a UniFi (WiFi Broadcasts + Networks) — no pasa por Postgres.",
        tags: ["Red"],
        querystring: StatusQuerySchema,
      }),
    },
    async (request, reply) => {
      const { sitio } = StatusQuerySchema.parse(request.query);
      return reply.send(await getLiveWifiNetworks(sitio));
    }
  );

  fastify.post(
    "/network/wifi-plans/preview",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      attachValidation: true,
      schema: routeDocs({
        summary: "Simular la creación de SSID en AP seleccionados",
        tags: ["Red"],
        body: WifiPlanPreviewSchema,
      }),
    },
    async (request, reply) => {
      const input = WifiPlanPreviewSchema.parse(request.body);
      const actor = request.authContext!;
      await authorizeNetworkChange(actor, [input.sitio]);
      const inventory = await getUnifiClient().getWifiPreviewInventory(input.sitio);
      await authorizeNetworkChange(actor, [input.sitio]);
      return reply.send({ source: env.UNIFI_MODE, ...previewWifiPlan(input, inventory) });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/network/nodes/:id",
    { schema: routeDocs({ summary: "Detalle de un nodo (AP/switch/gateway/UPS)", tags: ["Red"], params: NodeIdParamSchema }) },
    async (request, reply) => {
      return reply.send(await getApDetail(request.params.id));
    }
  );

  // Solo lectura contra UniFi (nunca escribe/reinicia) — igual queda detrás
  // de rol porque dispara una consulta activa, no es un GET de caché.
  fastify.post<{ Params: { id: string } }>(
    "/network/nodes/:id/diagnose",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      schema: routeDocs({
        summary: "Diagnóstico puntual de un nodo (consulta activa a UniFi, no escribe nada)",
        tags: ["Red"],
        params: NodeIdParamSchema,
      }),
    },
    async (request, reply) => {
      return reply.send(await diagnoseNode(request.params.id));
    }
  );

  // Reinicio remoto — nunca automático, solo tras confirmación explícita del técnico en el frontend.
  fastify.post<{ Params: { id: string } }>(
    "/network/nodes/:id/reboot",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      schema: routeDocs({
        summary: "Reiniciar un nodo real (reboot remoto)",
        description: "Nunca se dispara automático — solo tras confirmación explícita del técnico en el frontend.",
        tags: ["Red"],
        params: NodeIdParamSchema,
      }),
    },
    async (request, reply) => {
      return reply.send(await rebootNode(request.params.id, request.authContext!.userId));
    }
  );
}
