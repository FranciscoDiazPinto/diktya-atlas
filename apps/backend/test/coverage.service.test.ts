import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { createVenue } from "../src/services/venue.service.js";
import { createEventDeployment } from "../src/services/eventDeployment.service.js";
import { createEventZone, calibrateZone, computePixelsPerMeter } from "../src/services/eventZone.service.js";
import { placeAp } from "../src/services/apPlacement.service.js";
import { getCoverageAtPoint, findCoverageGaps } from "../src/services/coverage.service.js";
import { HttpError } from "../src/lib/errors.js";

describe("eventZone.service — calibración de escala", () => {
  it("computePixelsPerMeter calcula la escala correctamente", () => {
    const ppm = computePixelsPerMeter({ x: 0, y: 0 }, { x: 300, y: 0 }, 30);
    expect(ppm).toBeCloseTo(10, 5);
  });

  it("rechaza distancia real <= 0", () => {
    expect(() => computePixelsPerMeter({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toThrow();
  });

  it("rechaza dos puntos de calibración idénticos", () => {
    expect(() => computePixelsPerMeter({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toThrow();
  });
});

describe("coverage.service", () => {
  let venueId: string;
  let eventId: string;
  let zoneId: string;

  beforeAll(async () => {
    const venue = await createVenue({ nombre: `venue-test-${randomUUID()}`, planFilePath: "test.pdf" });
    venueId = venue.id;
    const event = await createEventDeployment({
      nombre: "evento-test",
      fechaInicio: new Date(),
      fechaFin: new Date(),
    });
    eventId = event.id;
    const zone = await createEventZone({ eventDeploymentId: eventId, venueId, nombreZona: "Zona A" });
    zoneId = zone.id;

    // Calibración: 300px = 30m -> 10 píxeles por metro.
    await calibrateZone(zoneId, { x: 0, y: 0 }, { x: 300, y: 0 }, 30);

    // AP con radio 5m (= 50px) en (100,100); un switch en el mismo punto no debe cubrir nada.
    await placeAp({ eventZoneId: zoneId, modelo: "U6_MESH", x: 100, y: 100, radioMetros: 5 });
    await placeAp({ eventZoneId: zoneId, modelo: "PRO_MAX_24", x: 100, y: 100 });
  });

  afterAll(async () => {
    await prisma.apPlacement.deleteMany({ where: { eventZoneId: zoneId } });
    await prisma.eventZone.deleteMany({ where: { eventDeploymentId: eventId } });
    await prisma.eventDeployment.delete({ where: { id: eventId } });
    await prisma.venue.delete({ where: { id: venueId } });
    await prisma.$disconnect();
  });

  it("un punto dentro del radio está cubierto", async () => {
    const result = await getCoverageAtPoint(zoneId, 120, 100); // 20px = 2m, radio 5m
    expect(result.cubierto).toBe(true);
    expect(result.apsEnRango).toHaveLength(1);
    expect(result.apsEnRango[0]?.distanciaMetros).toBeCloseTo(2, 1);
  });

  it("un punto fuera del radio no está cubierto", async () => {
    const result = await getCoverageAtPoint(zoneId, 100, 1100); // muy lejos
    expect(result.cubierto).toBe(false);
    expect(result.apsEnRango).toHaveLength(0);
  });

  it("un switch (radioMetros=0) nunca aparece en apsEnRango", async () => {
    const result = await getCoverageAtPoint(zoneId, 100, 100);
    expect(result.apsEnRango.every((ap) => ap.modelo !== "PRO_MAX_24")).toBe(true);
  });

  it("findCoverageGaps detecta zonas sin cobertura y excluye el área cubierta", async () => {
    // Plano de 300x300px (30x30m), celda de 5m (50px) -> grilla 6x6.
    const gaps = await findCoverageGaps(zoneId, 300, 300, 5);
    expect(gaps.some((g) => g.x > 250 && g.y > 250)).toBe(true); // lejos del AP: gap
    expect(gaps.some((g) => Math.hypot(g.x - 100, g.y - 100) < 10)).toBe(false); // cerca del AP: cubierto
  });

  it("findCoverageGaps rechaza una grilla demasiado densa", async () => {
    await expect(findCoverageGaps(zoneId, 300, 300, 0.001)).rejects.toBeInstanceOf(HttpError);
  });

  it("consultar cobertura de una zona sin calibrar devuelve 409", async () => {
    const zoneSinCalibrar = await createEventZone({
      eventDeploymentId: eventId,
      venueId,
      nombreZona: "Zona sin calibrar",
    });

    await expect(getCoverageAtPoint(zoneSinCalibrar.id, 0, 0)).rejects.toMatchObject({ statusCode: 409 });

    await prisma.eventZone.delete({ where: { id: zoneSinCalibrar.id } });
  });

  it("dos zonas del mismo evento son independientes: los APs de una no cubren a la otra", async () => {
    const zoneB = await createEventZone({ eventDeploymentId: eventId, venueId, nombreZona: "Zona B" });
    await calibrateZone(zoneB.id, { x: 0, y: 0 }, { x: 300, y: 0 }, 30); // misma escala, otra zona
    // Mismo punto (100,100) donde en la Zona A SÍ hay cobertura, pero acá no colocamos ningún AP.
    const result = await getCoverageAtPoint(zoneB.id, 100, 100);
    expect(result.cubierto).toBe(false);

    await prisma.eventZone.delete({ where: { id: zoneB.id } });
  });
});
