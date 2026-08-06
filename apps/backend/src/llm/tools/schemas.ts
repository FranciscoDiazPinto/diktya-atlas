import { toolSchemas, type ToolName } from "@diktya-atlas/shared";

export { toolSchemas, toolsByRole, type ToolName } from "@diktya-atlas/shared";

/**
 * Descripciones que el LLM ve para decidir cuándo invocar cada tool.
 * Vive en el backend (no en shared) porque es texto de prompt, no un
 * contrato de datos.
 */
export const toolDescriptions: Record<ToolName, string> = {
  get_network_status:
    "Obtiene el estado resumido de la red (APs online/offline, alertas activas) para un sitio, o para todos si no se especifica.",
  get_ap_detail:
    "Obtiene el detalle de un AP específico: señal, clientes conectados, SSIDs transmitidos, uptime.",
  diagnose_node:
    "Fuerza una consulta EN VIVO a UniFi para un nodo puntual (no espera al próximo polling automático de 30s) y guarda el resultado. Usar cuando el usuario pregunta explícitamente por el estado actual/reciente de un nodo, no el último dato cacheado.",
  get_node_history:
    "Devuelve el historial de un nodo: cambios de estado, alertas y tickets asociados, mezclados en una sola línea de tiempo ordenada de más reciente a más antiguo. Usar para responder '¿qué le pasó a este AP?' o '¿esto ya se intentó arreglar antes?'.",
  get_activity_digest:
    "Resume actividad (alertas, tickets con tiempos de resolución, reservas de VLAN, auditoría) en un rango de fechas, opcionalmente acotado a un evento. Si no se dan fechas, es 'hoy'.",
  get_availability:
    "Disponibilidad real por nodo en un rango de fechas: % online, serie temporal, histograma de duración de cortes. A partir de cambios de estado reales, no de un poll periódico.",
  list_open_issues:
    "Lista lo que queda pendiente ahora mismo: tickets sin resolver y alertas que todavía no generaron ticket, opcionalmente filtrado por sitio/severidad. Usar para '¿qué hay pendiente?' al arrancar un turno.",
  propose_vlan_plan:
    "A partir de filas de CSV (nombre_red, vlan_id, ssid, banda, sitio), genera un plan de cambios (diff) contra el estado actual. NO escribe nada todavía.",
  reserve_vlan:
    "Reserva una VLAN de un plan ya propuesto. Falla con 409 si esa VLAN+sitio ya tiene una reserva activa.",
  apply_vlan_plan:
    "Aplica una reserva de VLAN ya confirmada por el usuario. Encola el trabajo real en worker-remediation; nunca escribe directo.",
  create_ticket: "Crea un ticket de incidencia con severidad, descripción y nodo/reserva asociados.",
  escalate_ticket: "Escala un ticket existente (ej. a un admin) indicando el motivo.",
  assign_ticket: "Asigna un ticket a un usuario (ADMIN o TECNICO) para dejar trazabilidad de quién se está haciendo cargo.",
  notify_technicians: "Envía una notificación al grupo de técnicos configurado, con severidad y mensaje.",
  list_events:
    "Lista eventos (opcionalmente filtrados por nombre, ej. 'Expomin') para encontrar el eventDeploymentId antes de listar sus zonas.",
  list_event_zones:
    "Lista las zonas/pabellones/planos de un evento (un evento grande puede tener varios, ej. 'Pabellón 3', 'Estacionamiento') — usar para encontrar el eventZoneId antes de consultar cobertura o colocar un AP.",
  get_coverage_at_point:
    "Consulta si un punto (x,y en píxeles) del plano de una zona de evento tiene cobertura WiFi, y con qué AP(s) y a qué distancia.",
  find_coverage_gaps:
    "Barre en grilla el plano de una zona de evento y devuelve las áreas sin cobertura de ningún AP — usar para responder si hace falta instalar un AP en algún lugar.",
  place_ap:
    "Coloca un AP (o switch de rack) en el plano de una zona de evento, en coordenadas x,y con su modelo y radio de cobertura (con default por modelo si no se especifica).",
};

export function toolSchemaFor(name: ToolName) {
  return toolSchemas[name];
}
