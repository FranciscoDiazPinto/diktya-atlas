import { NodeStatus as PrismaNodeStatus } from "@prisma/client";
import { prisma } from "../db/client.js";
import { publishRealtimeEvent } from "../realtime/hub.js";
import { triageQueue, autoRemediateQueue } from "../workers/queues.js";
import type { NetworkNode, NodeStatus } from "../domain/network.js";
import { env } from "../config/env.js";

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
 * Upsert de un nodo + detección de transición a offline (crea Alert,
 * encola triage) + evento de tiempo real. Extraído de worker-monitor para
 * poder reusarlo tanto en el polling periódico (todos los nodos) como en
 * un diagnóstico puntual bajo demanda (un solo nodo, ver routes/network.ts).
 */
export async function syncNode(node: NetworkNode) {
  const previous = await prisma.networkNode.findUnique({ where: { externalId: node.id } });
  const dbStatus = toDbStatus(node.status);

  const saved = await prisma.networkNode.upsert({
    where: { externalId: node.id },
    create: {
      externalId: node.id,
      sitio: node.sitio,
      nombre: node.nombre,
      modelo: node.modelo,
      tipoDispositivo: node.tipoDispositivo,
      macAddress: node.macAddress,
      status: dbStatus,
      senalDbm: node.senalDbm,
      clientesConectados: node.clientesConectados,
      uptimeSegundos: node.uptimeSegundos,
      ultimaVezVisto: new Date(node.ultimaVezVisto),
      ssidsTransmitidos: node.ssidsTransmitidos,
    },
    update: {
      sitio: node.sitio,
      nombre: node.nombre,
      modelo: node.modelo,
      tipoDispositivo: node.tipoDispositivo,
      macAddress: node.macAddress,
      status: dbStatus,
      senalDbm: node.senalDbm,
      clientesConectados: node.clientesConectados,
      uptimeSegundos: node.uptimeSegundos,
      ultimaVezVisto: new Date(node.ultimaVezVisto),
      ssidsTransmitidos: node.ssidsTransmitidos,
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

  // Un registro por cambio (no por poll) — ver el comentario del modelo en
  // schema.prisma. `previous` ausente (primer sync de un nodo nuevo) cuenta
  // como cambio: establece el punto de partida de su historial.
  if (previous?.status !== dbStatus) {
    await prisma.nodeStatusEvent.create({ data: { nodeId: saved.id, status: dbStatus } });
  }

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

    if (isElegibleParaAutoRemediacion(saved)) {
      await autoRemediateQueue.add("auto-remediate", { nodeId: saved.id, alertId: alert.id });
    } else {
      await triageQueue.add("triage-alert", { alertId: alert.id });
    }
  }

  return saved;
}

/**
 * Elegible si el tipo de dispositivo está habilitado por config (política
 * de Admin, ver AUTO_REMEDIATE_DEVICE_TYPES en config/env.ts) y no está en
 * cooldown por un intento reciente (evita reintentar en loop sobre un
 * dispositivo que está flapping — ese caso escala directo a técnico).
 */
export function isElegibleParaAutoRemediacion(node: {
  tipoDispositivo: string;
  lastAutoRemediationAt: Date | null;
}): boolean {
  if (!env.AUTO_REMEDIATE_DEVICE_TYPES.has(node.tipoDispositivo)) return false;
  if (!node.lastAutoRemediationAt) return true;
  const minutosDesdeUltimoIntento = (Date.now() - node.lastAutoRemediationAt.getTime()) / 60_000;
  return minutosDesdeUltimoIntento >= env.AUTO_REMEDIATE_COOLDOWN_MINUTES;
}
