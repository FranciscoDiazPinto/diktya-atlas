/**
 * Tipos fieles al contrato real de la API de ATLAS, medido el 2026-08-10
 * (`Operacion/DIKTYA_ATLAS_CONTRATO_API.md` en la entrega de Lucas,
 * ~/Documentos/ENTREGA_FRANCISCO_2026-08-10/). No son un diseño propio: cada
 * campo documentado acá es lo que la API devolvió de verdad, incluidas sus
 * inconsistencias (`carp.problemas` es una lista pero `carp.detalle.problemas`
 * es un entero, `network.C1.demotion` es un string, etc.) — no "limpiar" estos
 * tipos sin volver a leer el contrato primero.
 */

export interface AtlasHealth {
  status: "ok";
  node: "atlas-mon-aa" | "atlas-mon-bb" | string;
  ts: string;
}

export interface AtlasVersion {
  app: string;
  /** Ojo: distinto string que `openapi.info.version` (acá "0.3.0", ahí "0.3.0-m3"). */
  version: string;
  /** Texto libre, no parsear (ej. "M3-telemetria"). */
  milestone: string;
}

export interface AtlasCarpBlock {
  ok: boolean;
  /** Si es false, `ok` no significa nada — un core no respondió. */
  evaluable: boolean;
  total: number;
  emparejadas: number;
  invertidas: unknown[];
  titular_perdido: boolean;
  maestras: { C1: number; C2: number };
  vistas: { C1: number; C2: number };
  /** Frase lista para pantalla, ej. "44/44 VIP emparejadas". Mostrar, no parsear. */
  resumen: string;
  detalle: {
    resumen: string;
    total: number;
    emparejadas: number;
    /** Entero (el largo de carp.problemas) — no la misma forma que el campo hermano de arriba. */
    problemas: number;
    titular_perdido: boolean;
    vips: unknown[];
  };
  /** Lista de problemas concretos — NO el mismo tipo que carp.detalle.problemas (ahí es un conteo). */
  problemas: unknown[];
}

export interface AtlasNetworkCoreStatus {
  ok: boolean;
  /** Latencia de esa consulta puntual — volátil por diseño, no cachear. */
  ms: number;
  /** Ya no es criterio de salud (ver AtlasCarpBlock) — solo recuento por core. */
  carp_master: number;
  carp_backup: number;
  /** String, no número, a pesar del nombre. */
  demotion: string;
}

export interface AtlasStatusNetwork {
  C1: AtlasNetworkCoreStatus;
  C2: AtlasNetworkCoreStatus;
  carp: AtlasCarpBlock;
}

export type AtlasUnifiDeviceState = "ONLINE" | "OFFLINE" | "UPDATING" | "GETTING_READY" | string;

export interface AtlasStatusUnifi {
  ok: boolean;
  ms: number;
  total: number;
  online: number;
  /** `name` es administrativo/renombrable — no usarlo como clave estable. */
  devices: Array<{ name: string; state: AtlasUnifiDeviceState }>;
}

export interface AtlasProxmoxGuest {
  vmid: number;
  nombre: string;
  tipo: "lxc" | "vm" | string;
  estado: string;
  uptime_h: number;
  mem_mb: number;
}

export interface AtlasProxmoxAlmacen {
  nombre: string;
  libre_gb: number;
  uso_pct: number;
}

export interface AtlasProxmoxNodo {
  ok: boolean;
  uptime_h: number;
  cpu_pct: number;
  /** String, no número. */
  load1: string;
  mem_pct: number;
  mem_usada_gb: number;
  mem_total_gb: number;
  disco_pct: number;
  pve: string;
  guests: AtlasProxmoxGuest[];
  almacenes: AtlasProxmoxAlmacen[];
}

export interface AtlasStatusProxmox {
  /** Comprobar siempre — en mon-bb es `false` con HTTP 200 igual (VLAN 25 no llega a PVE ahí). */
  ok: boolean;
  latency_ms: number;
  error?: string;
  /** Objeto por nombre de nodo (ej. "SMV-01"), no lista — una clave nueva si se agrega un hipervisor. */
  nodos?: Record<string, AtlasProxmoxNodo>;
  _resumen?: { nodos_ok: number; guests: number };
}

/**
 * `GET /status` — el agregado. EN VIVO (consulta los equipos en cada
 * petición), ~1-2s. `alertas`/`alertas_abiertas` no existen en mon-bb;
 * `proxmox` no existe en mon-aa — acceder siempre con `?.`/valor por defecto,
 * nunca indexar directo.
 */
export interface AtlasStatus {
  node: string;
  ts: string;
  /** El veredicto de salud del HA. Usar esto, no network.C1/C2.carp_master/backup. */
  ha_ok: boolean;
  carp: AtlasCarpBlock;
  unifi_ok: boolean;
  alertas_abiertas?: number;
  alertas?: AtlasAlert[];
  network: AtlasStatusNetwork;
  unifi: AtlasStatusUnifi;
  proxmox?: AtlasStatusProxmox;
}

export interface AtlasInventoryEquipo {
  /** Administrativo/renombrable — no hay mac ni id en este endpoint. */
  name: string;
  model: string;
  state: AtlasUnifiDeviceState;
  ip: string;
  fw: string;
  cpu_pct: number;
  mem_pct: number;
  uptime_s: number;
}

export interface AtlasInventoryRed {
  name: string;
  vlan: number;
}

export interface AtlasInventory {
  equipos: AtlasInventoryEquipo[];
  redes: AtlasInventoryRed[];
  /** Volátil por naturaleza — cambia entre lecturas de segundos. */
  clientes: number;
}

/** Lista abierta — tratar un kind desconocido como "info", no descartarlo. */
export type AtlasEventKind =
  | "port_down"
  | "port_up"
  | "speed_change"
  | "device_offline"
  | "device_online"
  | "client_roam"
  | "client_reconnect"
  | "client_new"
  | "client_gone"
  | "channel_change"
  | "carp_change"
  | "wan_change"
  | string;

export type AtlasSeverity = "info" | "warn" | "crit";

export interface AtlasEvent {
  ts: string;
  kind: AtlasEventKind;
  /**
   * Para carp_change: "CORE-01" en eventos viejos (histórico, detail con
   * enteros), "cores" en el código parcheado (nunca emitido hasta el
   * 2026-08-10 — sin verificar en vivo). Filtrar eventos por `kind`, nunca
   * por `entity`.
   */
  entity: string;
  /** Polimórfico según `kind` — tratar como diccionario opaco, .get() con defecto. */
  detail: Record<string, unknown>;
  severity: AtlasSeverity;
}

export interface AtlasEventsResponse {
  horas: number;
  /** Elementos devueltos (recortados por `limit`), no el total real en base — no hay paginación. */
  total: number;
  eventos: AtlasEvent[];
}

export interface AtlasAlert {
  rule: string;
  entity: string;
  severity: "warn" | "crit";
  opened_at: string;
  /** null = sigue abierta. Es el discriminador. */
  closed_at: string | null;
  /** Polimórfico por regla, puede ser {}. Para "ha_carp" ver AtlasHaCarpDetailOld/New. */
  detail: Record<string, unknown>;
}

/** Forma vieja de alerts[].detail para rule="ha_carp" — la única que hay en base hoy. */
export interface AtlasHaCarpDetailOld {
  master: number;
  backup: number;
}

/** Forma nueva de alerts[].detail para rule="ha_carp" — en el código, NO PROBADA en producción. */
export interface AtlasHaCarpDetailNew {
  resumen: string;
  total: number;
  emparejadas: number;
  problemas: number;
  titular_perdido: boolean;
  vips: unknown[];
}

export interface AtlasAlertsResponse {
  total: number;
  alertas: AtlasAlert[];
}

export interface AtlasHistorySample {
  ts: string;
  ok: boolean;
  latency_ms: number;
  resumen: Record<string, unknown>;
}

export interface AtlasHistoryResponse {
  source: string;
  horas: number;
  muestras: number;
  serie: AtlasHistorySample[];
}

export type AtlasTelemetrySourceName = "energia" | "opnsense_c1" | "opnsense_c2" | "proxmox" | "unifi" | string;

export interface AtlasTelemetrySource {
  source: AtlasTelemetrySourceName;
  ts: string;
  ok: boolean;
  latency_ms: number;
  /** JSON crudo del adaptador — NO es contrato, cambia con el fabricante/adaptador. */
  payload: unknown;
}

export interface AtlasTelemetryNow {
  fuentes: AtlasTelemetrySource[];
}

export interface AtlasRfRadio {
  ap: string;
  banda_ghz: number;
  canal: number;
  ancho_mhz: number;
  estandar: string;
  tx_retries_pct: number;
}

export interface AtlasRfAnalysis {
  radios: AtlasRfRadio[];
  /** Siempre vacíos hasta ahora — no asumir forma de sus elementos. */
  conflictos: unknown[];
  retries_altos: unknown[];
  veredicto: "ok" | string;
}

export interface AtlasUpsReading {
  /** String del fabricante, no normalizado ("OL" vs "OL BOOST" significan lo mismo). No comparar con "==". */
  estado: string;
  en_linea: boolean;
  en_bateria: boolean;
  bateria_pct: number;
  autonomia_min: number;
  carga_pct: number;
  voltaje_entrada: number;
  /** Solo la APC lo trae. */
  temperatura?: number;
  modelo: string;
  etiqueta?: string;
  /** Solo las UPS por NUT. */
  instancia_nut?: string;
  /** Solo las UPS por SNMP. */
  snmp?: string;
}

export interface AtlasEnergiaFuente {
  ok: boolean;
  error: string | null;
  ups: string[];
}

export interface AtlasEnergia {
  latency_ms: number;
  ok: boolean;
  /** true = hay datos pero incompletos (falta una fuente). No es lo mismo que ok:false. */
  degradado: boolean;
  /** Claves = número de serie de la UPS — pueden bailar si una UPS pierde su serial. */
  ups: Record<string, AtlasUpsReading>;
  /** Claves = dirección del camino de datos (ej. "nut@192.168.1.70") — recorrer, no indexar fijo. */
  fuentes: Record<string, AtlasEnergiaFuente>;
  _resumen: {
    total: number;
    en_bateria: number;
    autonomia_min_minima: number;
    alerta: boolean;
    degradado: boolean;
    fuentes_total: number;
    fuentes_ok: number;
    fuentes_caidas: string[];
  };
  /**
   * Solo aparece en respuestas degradadas — observado una vez, no
   * reproducible, y nunca se confirmó contra el código la condición exacta.
   * Usar `.error`, nunca asumir que la clave existe.
   */
  error?: string;
}

export interface AtlasClientEstado {
  ip: string | null;
  mac: string;
  name: string;
  type: string;
  /** Sufijo "Z", no "+00:00" — distinto del resto de timestamps de la API. */
  since: string;
  uplink: string;
}

export interface AtlasClientTimeline {
  mac: string;
  horas: number;
  conectado_ahora: boolean;
  /** null si el MAC no existe — un MAC inexistente da 200, no 404. Discriminar con estado === null. */
  estado: AtlasClientEstado | null;
  roams: number;
  reconexiones: number;
  /** Solo se ha observado "estable" — otros valores existen en el código pero no probados. */
  estabilidad: string;
  eventos: AtlasEvent[];
}

export interface AtlasTrafficTopEntry {
  /** Viene con máscara /32 — quitar el sufijo antes de usarla como IP limpia. */
  cliente: string;
  bytes: number;
  paquetes: number;
  flujos: number;
  mb: number;
  pct: number;
}

export interface AtlasTrafficTop {
  horas: number;
  clientes: number;
  total_mb: number;
  top: AtlasTrafficTopEntry[];
}

export interface AtlasTrafficPuerto {
  puerto: number;
  /** Número IANA: 6=TCP, 17=UDP, 112=VRRP/CARP. */
  protocolo: number;
  bytes: number;
  flujos: number;
  mb: number;
  /** Etiqueta que pone ATLAS, no viene del flujo. "-" si no lo reconoce. */
  servicio: string;
}

export interface AtlasTrafficPuertos {
  horas: number;
  puertos: AtlasTrafficPuerto[];
}

export interface AtlasTrafficClienteDestino {
  destino: string;
  puerto: number;
  bytes: number;
}

export interface AtlasTrafficCliente {
  cliente: string;
  horas: number;
  total_mb: number;
  /** Orden descendente, omite horas sin tráfico — no rellena con ceros. */
  serie_horaria: Array<{ hora: string; bytes: number }>;
  principales_destinos: AtlasTrafficClienteDestino[];
}

export interface AtlasBuscarCoincidencia {
  archivo: string;
  seccion: string;
  origen: string;
  /** Solo sirve para ordenar dentro de esta misma consulta, no comparable entre consultas. */
  relevancia: number;
  /** Términos marcados con <<...>>, no HTML. */
  extracto: string;
}

export interface AtlasBuscarResponse {
  consulta: string;
  resultados: number;
  coincidencias: AtlasBuscarCoincidencia[];
}

export interface AtlasBuscarDocumento {
  origen: string;
  archivo: string;
  secciones: number;
  indexado: string;
}

export interface AtlasBuscarDocumentosResponse {
  total: number;
  documentos: AtlasBuscarDocumento[];
}
