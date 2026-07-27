import { prisma } from "../db/client.js";
import { NotFoundError } from "../lib/errors.js";

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
