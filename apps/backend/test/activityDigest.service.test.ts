import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { getActivityDigest } from "../src/services/activityDigest.service.js";

describe("activityDigest.service", () => {
  const suffix = randomUUID();
  const userId = `user-digest-${suffix}`;
  const desde = new Date("2026-01-01T00:00:00.000Z");
  const dentroDelRango = new Date("2026-01-01T12:00:00.000Z");
  const resueltoDentroDelRango = new Date("2026-01-01T12:30:00.000Z"); // 30 min después
  const hasta = new Date("2026-01-01T23:59:59.999Z");
  const fueraDelRango = new Date("2026-02-01T00:00:00.000Z");

  let ticketId: string;

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: userId, email: `digest-${suffix}@test.local`, passwordHash: "x", role: "TECNICO" },
    });

    await prisma.alert.create({
      data: { sitio: "test", severidad: "CRITICO", mensaje: "dentro de rango", createdAt: dentroDelRango },
    });
    await prisma.alert.create({
      data: { sitio: "test", severidad: "INFO", mensaje: "fuera de rango", createdAt: fueraDelRango },
    });

    const ticket = await prisma.ticket.create({
      data: {
        titulo: `ticket-digest-${suffix}`,
        descripcion: "test",
        severidad: "ADVERTENCIA",
        estado: "RESUELTO",
        createdAt: dentroDelRango,
      },
    });
    ticketId = ticket.id;
    await prisma.ticketEvent.create({
      data: { ticketId, tipo: "RESUELTO", detalle: "test", createdAt: resueltoDentroDelRango },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        workerName: "worker-digest-test",
        parametros: {},
        resultado: {},
        exitoso: true,
        createdAt: dentroDelRango,
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        workerName: "worker-digest-test",
        parametros: {},
        resultado: {},
        exitoso: false,
        createdAt: dentroDelRango,
      },
    });

    await prisma.vlanReservation.create({
      data: {
        vlanId: 900,
        redSolicitada: `digest-test-${suffix}`,
        sitio: "test",
        estado: "RESERVADA",
        reservadoPorId: userId,
        planSnapshot: {},
        createdAt: dentroDelRango,
      },
    });
  });

  afterAll(async () => {
    await prisma.vlanReservation.deleteMany({ where: { reservadoPorId: userId } });
    await prisma.auditLog.deleteMany({ where: { actorId: userId } });
    await prisma.ticketEvent.deleteMany({ where: { ticketId } });
    await prisma.ticket.delete({ where: { id: ticketId } });
    await prisma.alert.deleteMany({ where: { sitio: "test", mensaje: { in: ["dentro de rango", "fuera de rango"] } } });
    await prisma.user.delete({ where: { id: userId } });
  });

  it("agrega solo lo que cae dentro del rango de fechas", async () => {
    const digest = await getActivityDigest({ desde, hasta });

    expect(digest.alertas.total).toBeGreaterThanOrEqual(1);
    const alertaDeTest = digest.alertas.items.find((a) => a.mensaje === "dentro de rango");
    expect(alertaDeTest).toBeDefined();
    expect(digest.alertas.items.some((a) => a.mensaje === "fuera de rango")).toBe(false);
  });

  it("calcula el tiempo de resolución promedio de tickets resueltos en el rango", async () => {
    const digest = await getActivityDigest({ desde, hasta });
    expect(digest.tickets.porEstado.RESUELTO).toBeGreaterThanOrEqual(1);
    expect(digest.tickets.tiempoResolucionPromedioMin).not.toBeNull();
    expect(digest.tickets.tiempoResolucionPromedioMin!).toBeGreaterThanOrEqual(29);
    expect(digest.tickets.tiempoResolucionPromedioMin!).toBeLessThanOrEqual(31);
  });

  it("cuenta auditoría exitosa/fallida por worker", async () => {
    const digest = await getActivityDigest({ desde, hasta });
    const entry = digest.auditoria.porWorker["worker-digest-test"];
    expect(entry).toEqual({ total: 2, exitosos: 1, fallidos: 1 });
  });

  it("cuenta reservas de VLAN por estado", async () => {
    const digest = await getActivityDigest({ desde, hasta });
    expect(digest.vlan.porEstado.RESERVADA).toBeGreaterThanOrEqual(1);
  });

  it("un rango sin nada da conteos en cero, no un error", async () => {
    const digest = await getActivityDigest({
      desde: new Date("2020-01-01T00:00:00.000Z"),
      hasta: new Date("2020-01-02T00:00:00.000Z"),
    });
    expect(digest.alertas.total).toBe(0);
    expect(digest.tickets.total).toBe(0);
    expect(digest.tickets.tiempoResolucionPromedioMin).toBeNull();
  });
});
