import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { assignTicket } from "../src/services/ticket.service.js";
import { NotFoundError, HttpError } from "../src/lib/errors.js";

describe("ticket.service — assignTicket", () => {
  const ticketIds: string[] = [];

  async function crearTicket() {
    const ticket = await prisma.ticket.create({
      data: { titulo: "Ticket de prueba", descripcion: "...", severidad: "INFO", estado: "ABIERTO" },
    });
    ticketIds.push(ticket.id);
    return ticket.id;
  }

  afterAll(async () => {
    await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  });

  it("asigna el ticket y deja un TicketEvent ASIGNADO con el email del usuario", async () => {
    const ticketId = await crearTicket();
    const event = await assignTicket(ticketId, "dev-tecnico");

    expect(event.tipo).toBe("ASIGNADO");
    expect(event.detalle).toContain("tecnico@dev.local");

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.asignadoAId).toBe("dev-tecnico");
  });

  it("también puede asignarse a un ADMIN", async () => {
    const ticketId = await crearTicket();
    await assignTicket(ticketId, "dev-admin");
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.asignadoAId).toBe("dev-admin");
  });

  it("rechaza asignar a un VISUALIZADOR (400)", async () => {
    const ticketId = await crearTicket();
    await expect(assignTicket(ticketId, "dev-visualizador")).rejects.toThrow(HttpError);

    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.asignadoAId).toBeNull();
  });

  it("ticket inexistente: NotFoundError", async () => {
    await expect(assignTicket("no-existe", "dev-admin")).rejects.toThrow(NotFoundError);
  });

  it("usuario inexistente: NotFoundError", async () => {
    const ticketId = await crearTicket();
    await expect(assignTicket(ticketId, "no-existe")).rejects.toThrow(NotFoundError);
  });
});
