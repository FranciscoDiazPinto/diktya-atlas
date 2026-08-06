import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { listOpenIssues } from "../src/services/openIssues.service.js";

describe("openIssues.service", () => {
  const suffix = randomUUID();
  const sitio = `test-open-issues-${suffix}`;
  const ticketIds: string[] = [];
  const alertIds: string[] = [];

  beforeAll(async () => {
    const ticketAbierto = await prisma.ticket.create({
      data: { titulo: "Ticket abierto", descripcion: "...", severidad: "CRITICO", estado: "ABIERTO" },
    });
    const ticketResuelto = await prisma.ticket.create({
      data: { titulo: "Ticket resuelto", descripcion: "...", severidad: "CRITICO", estado: "RESUELTO" },
    });
    ticketIds.push(ticketAbierto.id, ticketResuelto.id);

    const alertaSinTicket = await prisma.alert.create({
      data: { sitio, severidad: "ADVERTENCIA", mensaje: "Alerta suelta" },
    });
    const alertaConTicket = await prisma.alert.create({
      data: { sitio, severidad: "CRITICO", mensaje: "Alerta ya trackeada", ticketId: ticketAbierto.id },
    });
    alertIds.push(alertaSinTicket.id, alertaConTicket.id);
  });

  afterAll(async () => {
    await prisma.alert.deleteMany({ where: { id: { in: alertIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  });

  it("solo trae tickets sin resolver, nunca los RESUELTOS", async () => {
    const { tickets } = await listOpenIssues({});
    expect(tickets.some((t) => t.id === ticketIds[0])).toBe(true);
    expect(tickets.some((t) => t.id === ticketIds[1])).toBe(false);
  });

  it("solo trae alertas SIN ticket asociado — una alerta ya trackeada no aparece dos veces", async () => {
    const { alertasSinTicket } = await listOpenIssues({ sitio });
    expect(alertasSinTicket.some((a) => a.id === alertIds[0])).toBe(true);
    expect(alertasSinTicket.some((a) => a.id === alertIds[1])).toBe(false);
  });

  it("filtra alertas por sitio", async () => {
    const { alertasSinTicket } = await listOpenIssues({ sitio: `otro-sitio-${suffix}` });
    expect(alertasSinTicket).toHaveLength(0);
  });

  it("filtra por severidad", async () => {
    const { alertasSinTicket } = await listOpenIssues({ sitio, severidad: "CRITICO" });
    expect(alertasSinTicket).toHaveLength(0); // la única alerta CRITICO del sitio ya tiene ticket
  });
});
