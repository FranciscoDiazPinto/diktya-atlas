import type { FastifyInstance } from "fastify";
import { parseCsvRows } from "../services/csvIngestion.service.js";
import { generateVlanPlan } from "../services/planDiff.service.js";
import { getUnifiClient } from "../integrations/unifi/index.js";

export async function csvRoutes(fastify: FastifyInstance) {
  // Endpoint de ejemplo end-to-end (paso 1/4): sube CSV -> genera plan.
  // No reserva ni aplica nada todavía.
  fastify.post("/csv/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "Se requiere un archivo CSV (multipart, campo de archivo)" });
    }

    const buffer = await file.toBuffer();
    const filas = parseCsvRows(buffer.toString("utf-8"));
    const filasValidas = filas.filter((f) => f.ok).map((f) => f.datos!);

    if (filasValidas.length === 0) {
      return reply.send({ filas, plan: null });
    }

    const plan = await generateVlanPlan(filasValidas, getUnifiClient());
    return reply.send({ filas, plan });
  });
}
