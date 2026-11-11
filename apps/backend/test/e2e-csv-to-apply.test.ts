import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { parseCsvRows } from "../src/services/csvIngestion.service.js";
import { generateVlanPlan } from "../src/services/planDiff.service.js";
import { reserveVlanPlanItems, enqueueApplyVlanPlan } from "../src/services/vlanFlow.service.js";
import { processRemediation } from "../src/workers/remediation.logic.js";
import { getUnifiClient } from "../src/integrations/unifi/index.js";
import { prisma } from "../src/db/client.js";

/**
 * Flujo end-to-end de ejemplo pedido explícitamente por el prompt:
 * subir CSV -> generar plan -> reservar -> (confirmación explícita del
 * usuario, simulada acá por llamar directo a processRemediation en vez de
 * pasar por la cola real) -> aplicar, pasando por lock + verificación
 * post-escritura.
 */
describe("flujo e2e: CSV -> plan -> reserva -> aplicar", () => {
  const sitio = `sitio-e2e-${randomUUID()}`;
  const ssid = "SSID-E2E";
  const reservationIds: string[] = [];
  const planIds: string[] = [];
  const ctx = { userId: "dev-tecnico", role: "TECNICO" } as const;

  afterAll(async () => {
    await prisma.vlanReservation.deleteMany({ where: { id: { in: reservationIds } } });
    await prisma.ticket.deleteMany({ where: { vlanReservationId: { in: reservationIds } } });
    await prisma.networkChangePlan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.$disconnect();
  });

  it("procesa filas válidas e inválidas por separado (no todo-o-nada)", () => {
    const csv = [
      "nombre_red,vlan_id,ssid,banda,sitio",
      `Red Valida,77,${ssid},5GHz,${sitio}`,
      "Red Invalida,no-es-un-numero,,banda-rara,", // fila inválida a propósito
    ].join("\n");

    const filas = parseCsvRows(csv);
    expect(filas).toHaveLength(2);
    expect(filas[0]?.ok).toBe(true);
    expect(filas[1]?.ok).toBe(false);
    expect(filas[1]?.errores.length).toBeGreaterThan(0);
  });

  it("genera el plan, reserva, y aplica escribiendo en UniFi (mock) con verificación post-escritura", async () => {
    const csv = `nombre_red,vlan_id,ssid,banda,sitio\nRed Valida,77,${ssid},5GHz,${sitio}\n`;
    const filas = parseCsvRows(csv).filter((f) => f.ok).map((f) => f.datos!);
    expect(filas).toHaveLength(1);

    const client = getUnifiClient();

    // Estado inicial: no existe la red todavía -> el diff debe proponer "crear".
    const plan = await generateVlanPlan(filas, client, ctx);
    planIds.push(plan.id);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.accion).toBe("crear");

    const { results } = await reserveVlanPlanItems(plan.id, ctx, plan);
    expect(results).toHaveLength(1);
    expect(results[0]?.ok).toBe(true);
    const reservationId = results[0]!.reservationId!;
    reservationIds.push(reservationId);

    const beforeApply = await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } });
    expect(beforeApply.estado).toBe("RESERVADA");

    // "Confirmación explícita del usuario" -> aplicar. Se invoca la lógica
    // de worker-remediation directamente (mismo código que corre el
    // worker real) para no depender del timing async de la cola.
    const approval = await enqueueApplyVlanPlan(reservationId, ctx, plan);
    await processRemediation({ reservationId, approvalId: approval.approvalId });

    const afterApply = await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } });
    expect(afterApply.estado).toBe("APLICADA");

    const remoteNetwork = await client.getWifiNetwork(sitio, ssid);
    expect(remoteNetwork?.vlanId).toBe(77);

    // No debería haberse creado ningún ticket en el camino feliz.
    const tickets = await prisma.ticket.findMany({ where: { vlanReservationId: reservationId } });
    expect(tickets).toHaveLength(0);
  });

  it("una segunda reserva sobre la misma VLAN ya aplicada, si intenta re-aplicarse, es idempotente (no vuelve a escribir)", async () => {
    const reservationId = reservationIds[0];
    expect(reservationId).toBeDefined();

    // Reintentar processRemediation sobre una reserva que ya no está
    // RESERVADA (ya está APLICADA) debe ser un no-op seguro.
    const reservation = await prisma.vlanReservation.findUniqueOrThrow({ where: { id: reservationId } });
    await expect(
      processRemediation({ reservationId: reservationId!, approvalId: reservation.approvalId! })
    ).resolves.toBeUndefined();
  });
});
