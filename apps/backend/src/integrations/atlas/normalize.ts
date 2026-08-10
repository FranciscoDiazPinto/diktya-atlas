import type { Alert, AlertSeverity, DeviceType, NetworkNode, NodeStatus } from "../../domain/network.js";
import type { AtlasAlert, AtlasInventoryEquipo, AtlasStatus } from "./types.js";

/**
 * `/inventory` no segmenta por sitio (es una sola infraestructura real, no
 * varios sitios de UniFi) — se usa esta constante fija en vez de inventar
 * un valor, mismo literal que usaba `UNIFI_SITE` por defecto antes.
 */
const ATLAS_SITE = "default";

function inferTipoDispositivo(model: string): DeviceType {
  const m = model.toUpperCase();
  if (m.includes("UPS")) return "UPS";
  if (m.startsWith("USW") || m.includes("AGGREGATION")) return "SWITCH";
  if (m.includes("GATEWAY") || m.includes("FORTRESS")) return "GATEWAY";
  if (m.startsWith("U6") || m.startsWith("U7") || / IW$/i.test(model)) return "AP";
  return "OTRO";
}

function mapEstado(state: string): NodeStatus {
  switch (state) {
    case "ONLINE":
      return "online";
    case "OFFLINE":
      return "offline";
    // Transitorios (ver contrato §4.3) — no son un fallo, pero tampoco "online" de verdad.
    case "UPDATING":
    case "GETTING_READY":
      return "adopting";
    default:
      return "unknown";
  }
}

/**
 * `/inventory` no da `mac` ni `id` (confirmado en el contrato de ATLAS,
 * §8.7: "no tienes clave inmutable en este endpoint") — `equipo.name` es la
 * única clave disponible, y es renombrable. Si un equipo se renombra en
 * UniFi, el próximo sync crea un `NetworkNode` nuevo en vez de actualizar
 * el existente; el viejo queda huérfano, congelado en su último estado.
 * No hay forma de evitarlo con los datos que expone hoy la API — es una
 * limitación real, no un descuido de esta función.
 *
 * Tampoco hay `clientesConectados` por equipo (`/inventory` solo trae un
 * total de sitio) ni SSIDs por AP (esa relación vivía en la Integration
 * API directa de UniFi, que ARGOS ya no consulta por arquitectura) —
 * quedan en `0`/`[]` a propósito, nunca inventados.
 */
export function atlasEquipoToNetworkNode(equipo: AtlasInventoryEquipo, sitio: string = ATLAS_SITE): NetworkNode {
  return {
    id: equipo.name,
    sitio,
    nombre: equipo.name,
    modelo: equipo.model,
    tipoDispositivo: inferTipoDispositivo(equipo.model),
    status: mapEstado(equipo.state),
    clientesConectados: 0,
    uptimeSegundos: equipo.uptime_s,
    ultimaVezVisto: new Date().toISOString(),
    ssidsTransmitidos: [],
  };
}

/**
 * Representa el par HA (CORE-01/CORE-02) como dos `NetworkNode` sintéticos
 * para no romper el contrato que ya consume el frontend (`/opnsense/status`,
 * `OpnsenseCard`) — `status.network.C1/C2.ok` es exactamente el estado por
 * core que antes daba `OpnsenseClient.listNodes()`, ahora vía ATLAS en vez
 * de sondeo directo.
 */
export function atlasStatusToCoreNodes(status: AtlasStatus, sitio: string = ATLAS_SITE): NetworkNode[] {
  const now = new Date().toISOString();
  return [
    {
      id: "core-01",
      sitio,
      nombre: "CORE-01 (MASTER)",
      modelo: "OPNsense HA",
      tipoDispositivo: "GATEWAY",
      status: status.network.C1.ok ? "online" : "offline",
      clientesConectados: 0,
      ultimaVezVisto: now,
      ssidsTransmitidos: [],
    },
    {
      id: "core-02",
      sitio,
      nombre: "CORE-02 (BACKUP)",
      modelo: "OPNsense HA",
      tipoDispositivo: "GATEWAY",
      status: status.network.C2.ok ? "online" : "offline",
      clientesConectados: 0,
      ultimaVezVisto: now,
      ssidsTransmitidos: [],
    },
  ];
}

function mapSeveridad(severity: AtlasAlert["severity"]): AlertSeverity {
  return severity === "crit" ? "CRITICO" : "ADVERTENCIA";
}

/**
 * `detail` es polimórfico por `rule` (ver contrato §4.7) y para `ha_carp`
 * conviven dos formas en el histórico — misma lógica de detección que
 * documenta el contrato: mirar qué claves trae, no la fecha del registro.
 */
function describeAtlasAlert(alert: AtlasAlert): string {
  const d = alert.detail;
  switch (alert.rule) {
    case "ha_carp":
      if (typeof d.resumen === "string") return `HA CARP: ${d.resumen}`;
      if (typeof d.master === "number" && typeof d.backup === "number") {
        return `HA CARP: master=${d.master} backup=${d.backup}`;
      }
      return "HA CARP degradado";
    case "ups_fuente":
    case "ups_alcanzable":
      return typeof d.error === "string" ? `${alert.entity}: ${d.error}` : `Energía (${alert.entity}) con problemas`;
    case "unifi_todos_online":
      return `UniFi: ${d.online ?? "?"}/${d.total ?? "?"} equipos online`;
    case "unifi_alcanzable":
      return `UniFi (${alert.entity}) no alcanzable`;
    case "equipo_online":
      return `${alert.entity}: ${typeof d.state === "string" ? d.state : "estado desconocido"}`;
    default:
      return `${alert.rule} (${alert.entity})`;
  }
}

/**
 * `AtlasAlert` no trae un `id` estable (§8.7 del contrato) — se sintetiza
 * uno determinístico a partir de `rule`+`entity`+`opened_at`, único por
 * apertura de alerta (dos alertas de la misma regla/entidad no pueden
 * abrirse en el mismo instante).
 */
export function atlasAlertToAlert(alert: AtlasAlert, sitio: string = ATLAS_SITE): Alert {
  return {
    id: `${alert.rule}-${alert.entity}-${alert.opened_at}`,
    sitio,
    severidad: mapSeveridad(alert.severity),
    mensaje: describeAtlasAlert(alert),
    creadoEn: alert.opened_at,
  };
}
