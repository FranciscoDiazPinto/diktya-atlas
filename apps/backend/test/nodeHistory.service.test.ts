import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { getNodeHistory } from "../src/services/nodeHistory.service.js";
import { NotFoundError } from "../src/lib/errors.js";

describe("nodeHistory.service", () => {
  const suffix = randomUUID();
  const nodeIds: string[] = [];
  const ticketIds: string[] = [];

  let nodoId: string;

  beforeAll(async () => {
    const node = await prisma.networkNode.create({
      data: {
        externalId: `history-${suffix}`,
        sitio: "test-history",
        nombre: "AP Historial",
        tipoDispositivo: "AP",
        status: "ONLINE",
      },
    });
    nodoId = node.id;
    nodeIds.push(node.id);

    await prisma.nodeStatusEvent.create({
      data: { nodeId: nodoId, status: "OFFLINE", createdAt: new Date("2026-01-01T10:00:00.000Z") },
    });
    await prisma.nodeStatusEvent.create({
      data: { nodeId: nodoId, status: "ONLINE", createdAt: new Date("2026-01-01T10:05:00.000Z") },
    });

    const alert = await prisma.alert.create({
      data: {
        sitio: "test-history",
        nodeId: nodoId,
        severidad: "CRITICO",
        mensaje: "Nodo caído",
        createdAt: new Date("2026-01-01T10:00:30.000Z"),
      },
    });

    const ticket = await prisma.ticket.create({
      data: {
        titulo: "Auto-remediado: AP Historial",
        descripcion: "Pasos: reset enviado → volvió online",
        severidad: "INFO",
        estado: "RESUELTO",
        nodoAfectadoId: nodoId,
        createdAt: new Date("2026-01-01T10:05:30.000Z"),
      },
    });
    ticketIds.push(ticket.id);
    await prisma.alert.update({ where: { id: alert.id }, data: { ticketId: ticket.id } });
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.alert.deleteMany({ where: { nodeId: { in: nodeIds } } });
    await prisma.nodeStatusEvent.deleteMany({ where: { nodeId: { in: nodeIds } } });
    await prisma.networkNode.deleteMany({ where: { id: { in: nodeIds } } });
  });

  it("mezcla cambios de estado, alertas y tickets en una sola línea de tiempo, de más reciente a más antiguo", async () => {
    const { eventos } = await getNodeHistory({ nodeId: nodoId });

    expect(eventos.map((e) => e.tipo)).toEqual(["ticket", "cambio_estado", "alerta", "cambio_estado"]);
    // orden desc: el ticket (10:05:30) antes que el segundo cambio de estado (10:05:00)
    for (let i = 1; i < eventos.length; i++) {
      expect(eventos[i - 1]!.timestamp >= eventos[i]!.timestamp).toBe(true);
    }
  });

  it("incluye los datos propios de cada tipo de evento", async () => {
    const { eventos } = await getNodeHistory({ nodeId: nodoId });

    const ticketEvent = eventos.find((e) => e.tipo === "ticket");
    expect(ticketEvent).toMatchObject({ titulo: "Auto-remediado: AP Historial", estado: "RESUELTO" });

    const alertEvent = eventos.find((e) => e.tipo === "alerta");
    expect(alertEvent).toMatchObject({ severidad: "CRITICO", mensaje: "Nodo caído" });
    expect((alertEvent as { ticketId: string | null }).ticketId).toBe(ticketIds[0]);
  });

  it("devuelve los datos básicos del nodo consultado", async () => {
    const { node } = await getNodeHistory({ nodeId: nodoId });
    expect(node).toEqual({ id: nodoId, nombre: "AP Historial", sitio: "test-history" });
  });

  it("respeta el límite por categoría", async () => {
    const { eventos } = await getNodeHistory({ nodeId: nodoId, limit: 1 });
    // 1 de cada categoría (cambio_estado, alerta, ticket) como máximo -> a lo sumo 3
    expect(eventos.length).toBeLessThanOrEqual(3);
    expect(eventos.filter((e) => e.tipo === "cambio_estado")).toHaveLength(1);
  });

  it("nodo inexistente: NotFoundError", async () => {
    await expect(getNodeHistory({ nodeId: "no-existe" })).rejects.toThrow(NotFoundError);
  });
});
