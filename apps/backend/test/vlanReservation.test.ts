import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import type { VlanPlan } from "@diktya-atlas/shared";
import { prisma } from "../src/db/client.js";
import { reserveVlan } from "../src/services/vlanReservation.service.js";
import { ReservationConflictError } from "../src/lib/errors.js";

function fakePlan(): VlanPlan {
  return { id: randomUUID(), items: [], creadoEn: new Date().toISOString() };
}

describe("vlanReservation.service", () => {
  const sitio = `test-vlan-reservation-${randomUUID()}`;

  afterAll(async () => {
    await prisma.vlanReservation.deleteMany({ where: { sitio } });
    await prisma.$disconnect();
  });

  it("reserva una VLAN nueva sin conflicto", async () => {
    const reservation = await reserveVlan({
      vlanId: 50,
      sitio,
      redSolicitada: "Red-Test",
      reservadoPorId: "dev-tecnico",
      plan: fakePlan(),
    });
    expect(reservation.estado).toBe("RESERVADA");
    expect(reservation.vlanId).toBe(50);
  });

  it("una segunda reserva activa sobre la misma VLAN+sitio devuelve 409 (ReservationConflictError), sin reintentar silenciosamente", async () => {
    await reserveVlan({
      vlanId: 51,
      sitio,
      redSolicitada: "Red-Test-2",
      reservadoPorId: "dev-tecnico",
      plan: fakePlan(),
    });

    await expect(
      reserveVlan({
        vlanId: 51,
        sitio,
        redSolicitada: "Red-Test-2-otra-solicitud",
        reservadoPorId: "dev-tecnico",
        plan: fakePlan(),
      })
    ).rejects.toBeInstanceOf(ReservationConflictError);

    const activas = await prisma.vlanReservation.count({ where: { sitio, vlanId: 51 } });
    expect(activas).toBe(1);
  });

  it("libera una reserva permite volver a reservar la misma VLAN+sitio", async () => {
    const reservation = await reserveVlan({
      vlanId: 52,
      sitio,
      redSolicitada: "Red-Test-3",
      reservadoPorId: "dev-tecnico",
      plan: fakePlan(),
    });
    await prisma.vlanReservation.update({ where: { id: reservation.id }, data: { estado: "LIBERADA" } });

    const segunda = await reserveVlan({
      vlanId: 52,
      sitio,
      redSolicitada: "Red-Test-3",
      reservadoPorId: "dev-tecnico",
      plan: fakePlan(),
    });
    expect(segunda.estado).toBe("RESERVADA");
  });
});
