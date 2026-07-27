import { Worker } from "bullmq";
import { NodeStatus as PrismaNodeStatus } from "@prisma/client";
import { createRedisConnection } from "../db/redis.js";
import { getUnifiClient } from "../integrations/unifi/index.js";
import { prisma } from "../db/client.js";
import { triageQueue, type MonitorJobData } from "./queues.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import type { NodeStatus } from "../domain/network.js";

function toDbStatus(status: NodeStatus): PrismaNodeStatus {
  switch (status) {
    case "online":
      return PrismaNodeStatus.ONLINE;
    case "offline":
      return PrismaNodeStatus.OFFLINE;
    case "adopting":
      return PrismaNodeStatus.ADOPTING;
    default:
      return PrismaNodeStatus.UNKNOWN;
  }
}

/**
 * Único worker que hace polling a UniFi. Persiste el estado en Postgres
 * (nunca en memoria del proceso) para que un restart no pierda contexto,
 * y publica cada cambio al hub de tiempo real para el dashboard.
 */
async function pollAllSites(): Promise<void> {
  const client = getUnifiClient();
  const nodes = await client.listNodes();

  for (const node of nodes) {
    const previous = await prisma.networkNode.findUnique({ where: { externalId: node.id } });
    const dbStatus = toDbStatus(node.status);

    const saved = await prisma.networkNode.upsert({
      where: { externalId: node.id },
      create: {
        externalId: node.id,
        sitio: node.sitio,
        nombre: node.nombre,
        modelo: node.modelo,
        status: dbStatus,
        senalDbm: node.senalDbm,
        clientesConectados: node.clientesConectados,
        uptimeSegundos: node.uptimeSegundos,
        ultimaVezVisto: new Date(node.ultimaVezVisto),
      },
      update: {
        sitio: node.sitio,
        nombre: node.nombre,
        modelo: node.modelo,
        status: dbStatus,
        senalDbm: node.senalDbm,
        clientesConectados: node.clientesConectados,
        uptimeSegundos: node.uptimeSegundos,
        ultimaVezVisto: new Date(node.ultimaVezVisto),
      },
    });

    await publishRealtimeEvent({
      type: "node_status_changed",
      payload: {
        id: saved.id,
        externalId: saved.externalId,
        sitio: saved.sitio,
        nombre: saved.nombre,
        status: saved.status,
        clientesConectados: saved.clientesConectados,
      },
    });

    const wentOffline = previous?.status !== PrismaNodeStatus.OFFLINE && dbStatus === PrismaNodeStatus.OFFLINE;
    if (wentOffline) {
      const alert = await prisma.alert.create({
        data: {
          sitio: node.sitio,
          nodeId: saved.id,
          severidad: "ADVERTENCIA",
          mensaje: `AP "${node.nombre}" dejó de responder en el sitio ${node.sitio}`,
        },
      });
      await publishRealtimeEvent({ type: "alert", payload: alert });
      await triageQueue.add("triage-alert", { alertId: alert.id });
    }
  }
}

const worker = new Worker<MonitorJobData>("monitor", async () => pollAllSites(), {
  connection: createRedisConnection(),
});

worker.on("failed", (job, err) => {
  console.error(`[worker-monitor] job ${job?.id} falló`, err);
});
worker.on("ready", () => console.log("[worker-monitor] escuchando cola 'monitor'..."));
