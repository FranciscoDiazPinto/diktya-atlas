import { getOpnsenseClient } from "../integrations/opnsense/index.js";

/**
 * A diferencia de getNetworkStatusSummary (que lee de Postgres, poblado por
 * un worker de sync UniFi), OPNsense todavía no tiene ese pipeline — el
 * estado se consulta directo al cliente (mock hoy, fase 2 para real) en
 * cada request. Es aceptable porque es un panel de estado puntual para
 * ADMIN, no algo que necesite histórico ni joins.
 */
export async function getOpnsenseStatusSummary() {
  const client = getOpnsenseClient();
  const [nodos, alertas] = await Promise.all([client.listNodes(), client.listAlerts()]);

  const alertasPorSeveridad = { INFO: 0, ADVERTENCIA: 0, CRITICO: 0 };
  for (const alerta of alertas) alertasPorSeveridad[alerta.severidad]++;

  return {
    totalNodos: nodos.length,
    online: nodos.filter((n) => n.status === "online").length,
    offline: nodos.filter((n) => n.status === "offline").length,
    alertasPorSeveridad,
    nodos,
    alertas,
  };
}
