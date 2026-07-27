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
  propose_vlan_plan:
    "A partir de filas de CSV (nombre_red, vlan_id, ssid, banda, sitio), genera un plan de cambios (diff) contra el estado actual. NO escribe nada todavía.",
  reserve_vlan:
    "Reserva una VLAN de un plan ya propuesto. Falla con 409 si esa VLAN+sitio ya tiene una reserva activa.",
  apply_vlan_plan:
    "Aplica una reserva de VLAN ya confirmada por el usuario. Encola el trabajo real en worker-remediation; nunca escribe directo.",
  create_ticket: "Crea un ticket de incidencia con severidad, descripción y nodo/reserva asociados.",
  escalate_ticket: "Escala un ticket existente (ej. a un admin) indicando el motivo.",
  notify_technicians: "Envía una notificación al grupo de técnicos configurado, con severidad y mensaje.",
};

export function toolSchemaFor(name: ToolName) {
  return toolSchemas[name];
}
