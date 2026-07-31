import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { getAvailability } from "../src/services/nodeAvailability.service.js";

describe("nodeAvailability.service", () => {
  const suffix = randomUUID();
  const desde = new Date("2026-01-01T00:00:00.000Z");
  const hasta = new Date("2026-01-01T01:00:00.000Z"); // ventana de 60 min

  const nodeIds: string[] = [];

  async function crearNodo(externalId: string, nombre: string) {
    const node = await prisma.networkNode.create({
      data: { externalId, sitio: "test-availability", nombre, tipoDispositivo: "AP", status: "ONLINE" },
    });
    nodeIds.push(node.id);
    return node.id;
  }

  let nodoSiempreOnlineId: string;
  let nodoSeCaeAMitadId: string;
  let nodoSinDatosPreviosId: string;
  let nodoSinEventosId: string;

  beforeAll(async () => {
    nodoSiempreOnlineId = await crearNodo(`avail-a-${suffix}`, "Siempre Online");
    // estadoInicial ONLINE (evento ANTES de `desde`), sin más eventos en la ventana.
    await prisma.nodeStatusEvent.create({
      data: { nodeId: nodoSiempreOnlineId, status: "ONLINE", createdAt: new Date(desde.getTime() - 60_000) },
    });

    nodoSeCaeAMitadId = await crearNodo(`avail-b-${suffix}`, "Se Cae A Mitad");
    await prisma.nodeStatusEvent.create({
      data: { nodeId: nodoSeCaeAMitadId, status: "ONLINE", createdAt: new Date(desde.getTime() - 60_000) },
    });
    await prisma.nodeStatusEvent.create({
      data: { nodeId: nodoSeCaeAMitadId, status: "OFFLINE", createdAt: new Date(desde.getTime() + 30 * 60_000) },
    });

    nodoSinDatosPreviosId = await crearNodo(`avail-c-${suffix}`, "Sin Datos Previos");
    // Sin estadoInicial — su primer evento (ONLINE) cae DENTRO de la ventana, a los 10 min.
    await prisma.nodeStatusEvent.create({
      data: { nodeId: nodoSinDatosPreviosId, status: "ONLINE", createdAt: new Date(desde.getTime() + 10 * 60_000) },
    });

    nodoSinEventosId = await crearNodo(`avail-d-${suffix}`, "Sin Eventos");
    // Sin ningún NodeStatusEvent — nunca sincronizado por syncNode en la práctica.
  });

  afterAll(async () => {
    await prisma.nodeStatusEvent.deleteMany({ where: { nodeId: { in: nodeIds } } });
    await prisma.networkNode.deleteMany({ where: { id: { in: nodeIds } } });
  });

  it("nodo online toda la ventana: 100%", async () => {
    const resultado = await getAvailability({ desde, hasta });
    const nodo = resultado.porNodo.find((n) => n.nodeId === nodoSiempreOnlineId)!;
    expect(nodo.disponibilidadPct).toBe(100);
  });

  it("nodo que se cae a mitad de ventana: 50%", async () => {
    const resultado = await getAvailability({ desde, hasta });
    const nodo = resultado.porNodo.find((n) => n.nodeId === nodoSeCaeAMitadId)!;
    expect(nodo.disponibilidadPct).toBe(50);
  });

  it("nodo sin estado previo: el tramo sin datos no cuenta ni a favor ni en contra (100% de lo que sí se conoce)", async () => {
    const resultado = await getAvailability({ desde, hasta });
    const nodo = resultado.porNodo.find((n) => n.nodeId === nodoSinDatosPreviosId)!;
    expect(nodo.disponibilidadPct).toBe(100);
  });

  it("nodo sin ningún evento: disponibilidadPct null (sin datos), no cero", async () => {
    const resultado = await getAvailability({ desde, hasta });
    const nodo = resultado.porNodo.find((n) => n.nodeId === nodoSinEventosId)!;
    expect(nodo.disponibilidadPct).toBeNull();
  });

  it("el promedio general ignora los nodos sin datos", async () => {
    const resultado = await getAvailability({ desde, hasta });
    // 3 nodos con datos: 100, 50, 100 -> promedio 83.3
    expect(resultado.disponibilidadPromedio).toBeCloseTo(83.3, 1);
  });

  it("el outage de 30 min cae en el bucket 15-60 min del histograma", async () => {
    const resultado = await getAvailability({ desde, hasta });
    const bucket = resultado.histogramaOutages.find((b) => b.label === "15–60 min")!;
    expect(bucket.cantidad).toBe(1);
    const otros = resultado.histogramaOutages.filter((b) => b.label !== "15–60 min");
    expect(otros.every((b) => b.cantidad === 0)).toBe(true);
  });

  it("la serie temporal tiene 49 puntos (48 buckets) cubriendo el rango completo", async () => {
    const resultado = await getAvailability({ desde, hasta });
    expect(resultado.serieTemporal).toHaveLength(49);
    expect(resultado.serieTemporal[0]!.timestamp).toBe(desde.toISOString());
    expect(resultado.serieTemporal.at(-1)!.timestamp).toBe(hasta.toISOString());
  });
});
