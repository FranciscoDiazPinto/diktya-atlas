import { prisma } from "../db/client.js";
import { NotFoundError } from "../lib/errors.js";
import { getUnifiClient } from "../integrations/unifi/index.js";
import { syncNode } from "./nodeSync.service.js";
import { withLock } from "./lock.service.js";
import { recordAudit } from "./audit.service.js";

export async function getNetworkStatusSummary(sitio?: string) {
  const where = sitio ? { sitio } : {};
  const nodos = await prisma.networkNode.findMany({ where, orderBy: { nombre: "asc" } });
  const alertas = await prisma.alert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const alertasPorSeveridad = { INFO: 0, ADVERTENCIA: 0, CRITICO: 0 };
  for (const alerta of alertas) alertasPorSeveridad[alerta.severidad]++;

  return {
    totalNodos: nodos.length,
    online: nodos.filter((n) => n.status === "ONLINE").length,
    offline: nodos.filter((n) => n.status === "OFFLINE").length,
    adoptando: nodos.filter((n) => n.status === "ADOPTING").length,
    alertasPorSeveridad,
    nodos,
    alertasRecientes: alertas,
  };
}

/**
 * A diferencia de `getNetworkStatusSummary` (Postgres), esto pega en vivo a
 * UniFi (`listWifiNetworks` → Integration API real, WiFi Broadcasts +
 * Networks) — la tabla `WifiNetwork` de Postgres no la sincroniza nada
 * todavía (ni worker-monitor ni nodeSync.service), así que leer de ahí
 * siempre da vacío. Mismo patrón que unifiOsStatus.service.ts: bajo
 * demanda, nunca en el polling automático, para no generarle tráfico de
 * fondo al equipo real.
 */
export async function getLiveWifiNetworks(sitio?: string) {
  return getUnifiClient().listWifiNetworks(sitio);
}

export async function getApDetail(nodeId: string) {
  const node = await prisma.networkNode.findUnique({
    where: { id: nodeId },
    include: {
      wifiNetworks: true,
      alerts: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!node) throw new NotFoundError(`nodo ${nodeId}`);
  return node;
}

/**
 * Diagnóstico bajo demanda: en vez de esperar hasta 30s al próximo
 * polling automático (worker-monitor), consulta UniFi ahora mismo para
 * este nodo puntual y persiste el resultado (misma lógica de
 * upsert/detección de offline que el polling, ver nodeSync.service.ts).
 * Solo lectura contra UniFi — nunca escribe ni reinicia nada.
 */
export async function diagnoseNode(nodeId: string) {
  const dbNode = await prisma.networkNode.findUnique({ where: { id: nodeId } });
  if (!dbNode) throw new NotFoundError(`nodo ${nodeId}`);

  const fresh = await getUnifiClient().getNodeDetail(dbNode.externalId);
  if (!fresh) {
    throw new NotFoundError(`UniFi ya no reporta el nodo ${dbNode.externalId} (¿se dio de baja del controller?)`);
  }

  return syncNode(fresh);
}

/**
 * Reinicio remoto de un AP. NUNCA se dispara solo (ningún worker la llama)
 * — solo desde routes/network.ts, y solo cuando un técnico la confirma
 * explícitamente en el frontend. Lock distribuido para que dos clicks
 * (o un click doble) no manden dos comandos de restart en paralelo;
 * auditado siempre, incluso si falla.
 */
export async function rebootNode(nodeId: string, actorId: string) {
  const dbNode = await prisma.networkNode.findUnique({ where: { id: nodeId } });
  if (!dbNode) throw new NotFoundError(`nodo ${nodeId}`);

  try {
    await withLock(`reboot:${dbNode.externalId}`, () => getUnifiClient().rebootNode(dbNode.externalId));
    await recordAudit({
      actorId,
      workerName: "rest-api",
      toolName: "reboot_node",
      parametros: { nodeId, externalId: dbNode.externalId },
      resultado: { ok: true },
      exitoso: true,
    });
  } catch (err) {
    await recordAudit({
      actorId,
      workerName: "rest-api",
      toolName: "reboot_node",
      parametros: { nodeId, externalId: dbNode.externalId },
      resultado: { error: err instanceof Error ? err.message : String(err) },
      exitoso: false,
    });
    throw err;
  }

  // El AP tarda en volver a reportar — no forzamos un diagnóstico inmediato
  // acá (todavía va a decir "offline"/"adopting"), el frontend puede pedirlo
  // manualmente ("Actualizar ahora") cuando el técnico crea que ya volvió.
  return { ok: true };
}
