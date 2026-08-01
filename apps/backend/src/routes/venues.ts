import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../auth/middleware.js";
import { savePlanFile } from "../services/fileStorage.service.js";
import { createVenue, listVenues, getVenue } from "../services/venue.service.js";
import { HttpError } from "../lib/errors.js";
import { routeDocs, multipartRouteDocs } from "../lib/openapi.js";

const CreateVenueFieldsSchema = z.object({ nombre: z.string().min(1) });
const VenueIdParamSchema = z.object({ id: z.string() });

export async function venueRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", authenticate);

  fastify.get(
    "/venues",
    { schema: routeDocs({ summary: "Listar recintos (venues)", tags: ["Venues"] }) },
    async (_request, reply) => {
      return reply.send(await listVenues());
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/venues/:id",
    { schema: routeDocs({ summary: "Detalle de un recinto", tags: ["Venues"], params: VenueIdParamSchema }) },
    async (request, reply) => {
      return reply.send(await getVenue(request.params.id));
    }
  );

  // multipart: campo "nombre" + archivo del plano base (PDF/imagen).
  fastify.post(
    "/venues",
    {
      preHandler: requireRole("ADMIN", "TECNICO"),
      schema: multipartRouteDocs({
        summary: "Crear un recinto con su plano base",
        description: "multipart/form-data: campo `nombre` + archivo del plano (PDF/imagen).",
        tags: ["Venues"],
      }),
    },
    async (request, reply) => {
      let nombre: string | undefined;
      let planFilePath: string | undefined;

      for await (const part of request.parts()) {
        if (part.type === "file") {
          planFilePath = await savePlanFile(part);
        } else if (part.fieldname === "nombre") {
          nombre = part.value as string;
        }
      }

      if (!planFilePath) throw new HttpError(400, "Se requiere el archivo del plano (PDF/imagen)");
      const { nombre: nombreValido } = CreateVenueFieldsSchema.parse({ nombre });

      const venue = await createVenue({ nombre: nombreValido, planFilePath });
      return reply.code(201).send(venue);
    }
  );
}
