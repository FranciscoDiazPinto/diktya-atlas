import { getAtlasClient } from "../integrations/atlas/index.js";
import { atlasAlertToAlert, atlasStatusToCoreNodes } from "../integrations/atlas/normalize.js";

/**
 * Nombre histórico ("OPNsense") — desde el 2026-08-10 ya no sondea OPNsense
 * directo, lee el par HA (CORE-01/CORE-02) y las alertas abiertas vía la
 * API de ATLAS (regla dura de arquitectura, ver `Atlas/ARGOS Arquitectura
 * y Entrega 2026-08-10.md`). EN VIVO en cada request igual que antes —
 * `/status` de ATLAS también consulta los equipos en cada llamada, así que
 * sigue sin tener sentido cachearlo en Postgres para un panel puntual de
 * ADMIN.
 */
export async function getOpnsenseStatusSummary() {
  const client = getAtlasClient();
  const [status, alertsResponse] = await Promise.all([client.status(), client.alerts()]);

  const nodos = atlasStatusToCoreNodes(status);
  const alertas = alertsResponse.alertas.map((a) => atlasAlertToAlert(a));

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
