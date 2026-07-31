import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../src/db/client.js";
import { getUnifiClient, MockUnifiClient } from "../src/integrations/unifi/index.js";
import { processAutoRemediation } from "../src/services/autoRemediation.service.js";
import { triageQueue } from "../src/workers/queues.js";

describe("autoRemediation.service", () => {
  const suffix = randomUUID();
  const externalId = `mock-ap-${suffix}`;
  let nodeId: string;
  let alertId: string;

  function seedMockNode(status: "online" | "offline" | "adopting") {
    const client = getUnifiClient() as MockUnifiClient;
    client.seedNode({
      id: externalId,
      sitio: "test-autoremediate",
      nombre: "AP Test",
      tipoDispositivo: "AP",
      status,
      clientesConectados: 0,
      ultimaVezVisto: new Date().toISOString(),
      ssidsTransmitidos: [],
    });
  }

  beforeEach(async () => {
    seedMockNode("offline");

    const node = await prisma.networkNode.create({
      data: {
        externalId,
        sitio: "test-autoremediate",
        nombre: "AP Test",
        tipoDispositivo: "AP",
        status: "OFFLINE",
      },
    });
    nodeId = node.id;

    const alert = await prisma.alert.create({
      data: { sitio: "test-autoremediate", nodeId, severidad: "ADVERTENCIA", mensaje: "AP Test dejó de responder" },
    });
    alertId = alert.id;
  });

  afterEach(async () => {
    await prisma.ticket.deleteMany({ where: { nodoAfectadoId: nodeId } });
    await prisma.alert.deleteMany({ where: { nodeId } });
    await prisma.networkNode.delete({ where: { id: nodeId } }).catch(() => {});
  });

  it("si ya se recuperó solo antes de correr, no reintenta nada y cierra con ticket INFO ya resuelto", async () => {
    seedMockNode("online"); // se recuperó solo antes de que el job corriera

    await processAutoRemediation({ nodeId, alertId });

    const ticket = await prisma.ticket.findFirst({ where: { nodoAfectadoId: nodeId } });
    expect(ticket).not.toBeNull();
    expect(ticket?.severidad).toBe("INFO");
    expect(ticket?.estado).toBe("RESUELTO");
    expect(ticket?.descripcion).toContain("ya estaba online");

    const jobs = await triageQueue.getJobs(["waiting", "delayed"]);
    expect(jobs.some((j) => j.data.alertId === alertId)).toBe(false);
  });

  it("si el reset no lo recupera y no hay MAC guardada, escala a triage con la nota previa (nunca deja el offline sin avisar a nadie)", async () => {
    await processAutoRemediation({ nodeId, alertId });

    // MockUnifiClient.rebootNode pone status="adopting", nunca "online" —
    // sin MAC tampoco se intenta re-adopción, así que tiene que escalar.
    const ticket = await prisma.ticket.findFirst({ where: { nodoAfectadoId: nodeId } });
    expect(ticket).toBeNull(); // no crea ticket de "éxito" — lo crea worker-triage, no este servicio

    const jobs = await triageQueue.getJobs(["waiting", "delayed"]);
    const job = jobs.find((j) => j.data.alertId === alertId);
    expect(job).toBeDefined();
    expect(job?.data.notaPrevia).toContain("sin éxito");
    expect(job?.data.notaPrevia).toContain("reset enviado");
  });

  it("marca lastAutoRemediationAt sin importar el resultado (arranca el cooldown)", async () => {
    await processAutoRemediation({ nodeId, alertId });

    const node = await prisma.networkNode.findUniqueOrThrow({ where: { id: nodeId } });
    expect(node.lastAutoRemediationAt).not.toBeNull();
  });
});
