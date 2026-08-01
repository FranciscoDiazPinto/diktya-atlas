import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../auth/middleware.js";
import { createEventDeployment, getEventDeployment, listEventDeployments } from "../services/eventDeployment.service.js";
import { getEventReport } from "../services/eventReport.service.js";
import { routeDocs } from "../lib/openapi.js";

const ListQuerySchema = z.object({ nombre: z.string().optional() });
const CreateEventBodySchema = z
  .object({
    nombre: z.string().min(1),
    fechaInicio: z.coerce.date(),
    fechaFin: z.coerce.date(),
  })
  .refine((body) => body.fechaFin >= body.fechaInicio, {
    message: "fechaFin no puede ser anterior a fechaInicio",
    path: ["fechaFin"],
  });
const EventIdParamSchema = z.object({ id: z.string() });

/**
 * Solo CRUD del evento en sí (contenedor lógico, ej. "Expomin 2026"). Los
 * planos/calibración/APs viven por zona — ver routes/eventZones.ts.
 */
export async function eventRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get(
    "/events",
    {
      attachValidation: true,
      schema: routeDocs({ summary: "Listar despliegues de evento", tags: ["Eventos"], querystring: ListQuerySchema }),
    },
    async (request, reply) => {
      const { nombre } = ListQuerySchema.parse(request.query);
      return reply.send(await listEventDeployments(nombre));
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/events/:id",
    { schema: routeDocs({ summary: "Detalle de un evento", tags: ["Eventos"], params: EventIdParamSchema }) },
    async (request, reply) => {
      return reply.send(await getEventDeployment(request.params.id));
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/events/:id/report",
    { schema: routeDocs({ summary: "Reporte de cobertura de un evento", tags: ["Eventos"], params: EventIdParamSchema }) },
    async (request, reply) => {
      return reply.send(await getEventReport(request.params.id));
    }
  );

  fastify.post(
    "/events",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      attachValidation: true,
      schema: routeDocs({ summary: "Crear un despliegue de evento", tags: ["Eventos"], body: CreateEventBodySchema }),
    },
    async (request, reply) => {
      const body = CreateEventBodySchema.parse(request.body);
      const event = await createEventDeployment(body);
      return reply.code(201).send(event);
    }
  );
}
