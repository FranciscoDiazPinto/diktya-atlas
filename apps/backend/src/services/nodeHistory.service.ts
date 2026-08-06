import { prisma } from "../db/client.js";
import { NotFoundError } from "../lib/errors.js";

export interface NodeHistoryParams {
  nodeId: string;
  limit?: number;
}

const DEFAULT_LIMIT = 20;

export type NodeHistoryEvent =
  | { tipo: "cambio_estado"; timestamp: string; status: string }
  | { tipo: "alerta"; timestamp: string; severidad: string; mensaje: string; ticketId: string | null }
  | { tipo: "ticket"; timestamp: string; ticketId: string; titulo: string; estado: string; severidad: string };

/**
 * Timeline de "qué le pasó" a un nodo — cambios de estado (NodeStatusEvent),
 * alertas y tickets, mezclados y ordenados por fecha desc. Hoy esto solo se
 * puede reconstruir a mano yendo ticket por ticket (cada intento de
 * auto-remediación queda narrado paso a paso en la descripción del ticket
 * que genera, ver autoRemediation.service.ts) — pensado para que un técnico
 * llegando a atender un incidente vea de un vistazo el historial completo.
 * `limit` se aplica por categoría antes de mezclar, no al total, para que un
 * nodo con muchos tickets no le gane espacio a sus cambios de estado.
 */
export async function getNodeHistory({ nodeId, limit = DEFAULT_LIMIT }: NodeHistoryParams): Promise<{
  node: { id: string; nombre: string; sitio: string };
  eventos: NodeHistoryEvent[];
}> {
  const node = await prisma.networkNode.findUnique({ where: { id: nodeId } });
  if (!node) throw new NotFoundError(`nodo ${nodeId}`);

  const [statusEvents, alerts, tickets] = await Promise.all([
    prisma.nodeStatusEvent.findMany({ where: { nodeId }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.alert.findMany({ where: { nodeId }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.ticket.findMany({ where: { nodoAfectadoId: nodeId }, orderBy: { createdAt: "desc" }, take: limit }),
  ]);

  const eventos: NodeHistoryEvent[] = [
    ...statusEvents.map(
      (e): NodeHistoryEvent => ({ tipo: "cambio_estado", timestamp: e.createdAt.toISOString(), status: e.status })
    ),
    ...alerts.map(
      (a): NodeHistoryEvent => ({
        tipo: "alerta",
        timestamp: a.createdAt.toISOString(),
        severidad: a.severidad,
        mensaje: a.mensaje,
        ticketId: a.ticketId,
      })
    ),
    ...tickets.map(
      (t): NodeHistoryEvent => ({
        tipo: "ticket",
        timestamp: t.createdAt.toISOString(),
        ticketId: t.id,
        titulo: t.titulo,
        estado: t.estado,
        severidad: t.severidad,
      })
    ),
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return { node: { id: node.id, nombre: node.nombre, sitio: node.sitio }, eventos };
}
