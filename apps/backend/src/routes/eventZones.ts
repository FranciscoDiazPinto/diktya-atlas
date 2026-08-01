import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../auth/middleware.js";
import { savePlanFile } from "../services/fileStorage.service.js";
import { createEventZone, getEventZone, listEventZones, calibrateZone } from "../services/eventZone.service.js";
import { placeAp, updateAp, deleteAp, listAps } from "../services/apPlacement.service.js";
import { getCoverageAtPoint, findCoverageGaps } from "../services/coverage.service.js";
import { routeDocs, multipartRouteDocs } from "../lib/openapi.js";

const ZoneParamSchema = z.object({ eventId: z.string() });
const ApParamSchema = z.object({ eventId: z.string(), zoneId: z.string() });
const ApItemParamSchema = z.object({ eventId: z.string(), zoneId: z.string(), apId: z.string() });

const CreateZoneFieldsSchema = z.object({
  venueId: z.string(),
  nombreZona: z.string().min(1),
});
const CalibrateBodySchema = z.object({
  p1: z.object({ x: z.number(), y: z.number() }),
  p2: z.object({ x: z.number(), y: z.number() }),
  distanciaMetros: z.number().positive(),
});
const ApModelSchema = z.enum(["U6_MESH", "U7_CAMPUS", "PRO_MAX_24", "FLEX_MINI", "FLEX", "FLEX_ULTRA"]);
const PlaceApBodySchema = z.object({
  modelo: ApModelSchema,
  x: z.number(),
  y: z.number(),
  radioMetros: z.number().nonnegative().optional(),
  rackLabel: z.string().optional(),
});
const UpdateApBodySchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  radioMetros: z.number().nonnegative().optional(),
  rackLabel: z.string().optional(),
});
const CoverageQuerySchema = z.object({ x: z.coerce.number(), y: z.coerce.number() });
const GapsQuerySchema = z.object({
  planWidthPx: z.coerce.number().positive(),
  planHeightPx: z.coerce.number().positive(),
  cellSizeMeters: z.coerce.number().positive().optional(),
});

/**
 * Todo lo que vive DENTRO de una zona de un evento: su plano (opcional
 * override del Venue), calibración de escala propia, y los APs colocados
 * ahí. Un evento grande (ej. Expomin) tiene varias de estas.
 */
export async function eventZoneRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get<{ Params: { eventId: string } }>(
    "/events/:eventId/zones",
    { schema: routeDocs({ summary: "Listar zonas de un evento", tags: ["Zonas de evento"], params: ZoneParamSchema }) },
    async (request, reply) => {
      return reply.send(await listEventZones(request.params.eventId));
    }
  );

  fastify.get<{ Params: { eventId: string; zoneId: string } }>(
    "/events/:eventId/zones/:zoneId",
    { schema: routeDocs({ summary: "Detalle de una zona", tags: ["Zonas de evento"], params: ApParamSchema }) },
    async (request, reply) => {
      return reply.send(await getEventZone(request.params.zoneId));
    }
  );

  // multipart: venueId + nombreZona + archivo opcional de override del plano.
  fastify.post<{ Params: { eventId: string } }>(
    "/events/:eventId/zones",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      schema: multipartRouteDocs({
        summary: "Crear una zona dentro de un evento",
        description: "multipart/form-data: `venueId` + `nombreZona` + archivo opcional (override del plano del venue).",
        tags: ["Zonas de evento"],
        params: ZoneParamSchema,
      }),
    },
    async (request, reply) => {
      const fields: Record<string, string> = {};
      let planFilePath: string | undefined;

      for await (const part of request.parts()) {
        if (part.type === "file") {
          planFilePath = await savePlanFile(part);
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }

      const body = CreateZoneFieldsSchema.parse(fields);
      const zone = await createEventZone({ eventDeploymentId: request.params.eventId, ...body, planFilePath });
      return reply.code(201).send(zone);
    }
  );

  fastify.post<{ Params: { eventId: string; zoneId: string } }>(
    "/events/:eventId/zones/:zoneId/calibrate",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      attachValidation: true,
      schema: routeDocs({
        summary: "Calibrar la escala del plano de una zona",
        description: "Dos puntos en píxeles (`p1`, `p2`) + la distancia real entre ellos en metros.",
        tags: ["Zonas de evento"],
        params: ApParamSchema,
        body: CalibrateBodySchema,
      }),
    },
    async (request, reply) => {
      const { p1, p2, distanciaMetros } = CalibrateBodySchema.parse(request.body);
      return reply.send(await calibrateZone(request.params.zoneId, p1, p2, distanciaMetros));
    }
  );

  fastify.get<{ Params: { eventId: string; zoneId: string } }>(
    "/events/:eventId/zones/:zoneId/aps",
    { schema: routeDocs({ summary: "Listar APs colocados en una zona", tags: ["Zonas de evento"], params: ApParamSchema }) },
    async (request, reply) => {
      return reply.send(await listAps(request.params.zoneId));
    }
  );

  fastify.post<{ Params: { eventId: string; zoneId: string } }>(
    "/events/:eventId/zones/:zoneId/aps",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      attachValidation: true,
      schema: routeDocs({
        summary: "Colocar un AP en el plano de una zona (por click, sin señal real todavía)",
        tags: ["Zonas de evento"],
        params: ApParamSchema,
        body: PlaceApBodySchema,
      }),
    },
    async (request, reply) => {
      const body = PlaceApBodySchema.parse(request.body);
      const ap = await placeAp({ eventZoneId: request.params.zoneId, ...body });
      return reply.code(201).send(ap);
    }
  );

  fastify.patch<{ Params: { eventId: string; zoneId: string; apId: string } }>(
    "/events/:eventId/zones/:zoneId/aps/:apId",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      attachValidation: true,
      schema: routeDocs({
        summary: "Mover/editar un AP colocado",
        tags: ["Zonas de evento"],
        params: ApItemParamSchema,
        body: UpdateApBodySchema,
      }),
    },
    async (request, reply) => {
      const body = UpdateApBodySchema.parse(request.body);
      return reply.send(await updateAp(request.params.apId, body));
    }
  );

  fastify.delete<{ Params: { eventId: string; zoneId: string; apId: string } }>(
    "/events/:eventId/zones/:zoneId/aps/:apId",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      schema: routeDocs({ summary: "Quitar un AP colocado", tags: ["Zonas de evento"], params: ApItemParamSchema }),
    },
    async (request, reply) => {
      await deleteAp(request.params.apId);
      return reply.code(204).send();
    }
  );

  fastify.get<{ Params: { eventId: string; zoneId: string } }>(
    "/events/:eventId/zones/:zoneId/coverage",
    {
      attachValidation: true,
      schema: routeDocs({
        summary: "Cobertura geométrica en un punto del plano",
        description: "Cobertura por geometría (radio de cada AP), sin señal real todavía.",
        tags: ["Zonas de evento"],
        params: ApParamSchema,
        querystring: CoverageQuerySchema,
      }),
    },
    async (request, reply) => {
      const { x, y } = CoverageQuerySchema.parse(request.query);
      return reply.send(await getCoverageAtPoint(request.params.zoneId, x, y));
    }
  );

  fastify.get<{ Params: { eventId: string; zoneId: string } }>(
    "/events/:eventId/zones/:zoneId/coverage/gaps",
    {
      attachValidation: true,
      schema: routeDocs({
        summary: "Detectar huecos de cobertura en el plano",
        description: "Grilla de celdas (`cellSizeMeters`, default en el service) sobre el plano completo.",
        tags: ["Zonas de evento"],
        params: ApParamSchema,
        querystring: GapsQuerySchema,
      }),
    },
    async (request, reply) => {
      const { planWidthPx, planHeightPx, cellSizeMeters } = GapsQuerySchema.parse(request.query);
      return reply.send(await findCoverageGaps(request.params.zoneId, planWidthPx, planHeightPx, cellSizeMeters));
    }
  );
}
