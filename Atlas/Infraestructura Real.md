---
tags: [atlas, infraestructura, diktya]
updated: 2026-08-10
---

# Infraestructura real de Diktya Atlas

Esto es la infraestructura física/operativa real que ARGOS (antes "NetBot") está pensado para
operar como "agente de terreno" — separado del software (ver [[Proyecto Atlas]]). Fuente:
entrega formal de Lucas, `~/Documentos/ENTREGA_FRANCISCO_2026-08-10/` (no versionada en el repo,
son datos operativos reales — la ruta vieja `~/Descargas/DIKTYA ATLAS/` ya no existe).

## Qué es

Operador de red para eventos móviles (expos, ferias). Activos **permanentes**:
- 3 WANs: Starlink (901), WAN BK (respaldo), 5G (902).
- Rack AA (fijo). Rack BB viaja solo para eventos grandes.

## Componentes core

| Componente       | Rol                          | Dirección                                                                                        | Notas                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORE-01          | OPNsense, MASTER             | `10.71.111.101`                                                                                  | SSH puerto **222**, no 22                                                                                                                                                                                                                                                                                                    |
| CORE-02          | OPNsense, BACKUP             | `10.71.111.102`                                                                                  | Solo 7 componentes sincronizan automático con CORE-01 — el resto necesita dual-write manual                                                                                                                                                                                                                                  |
| UniFi Controller | Gestión WiFi                 | `192.168.1.1` (interno) / `https://10.71.111.101:8443` vía ZT (2026-07-29, ver [[Rutas de Red]]) | **UDM Enterprise Fortress Gateway** (`UDMENT`, shortName "EFG" — coincide con `UNIFI-EFG-01_credenciales.txt` y la ruta de rescate EFG), corre **UniFi OS** (no el controller clásico self-hosted) → soporta API key nativa. No confundir `192.168.1.1` con el router local de este equipo de desarrollo, que coincide en IP |
| SMV-01 / SMV-02  | Proxmox                      | `10.71.111.201:8006` / `10.71.111.202:8006`                                                      | Independientes, **no clusterizados**                                                                                                                                                                                                                                                                                         |
| MikroTik Chateau | Camino OOB de rescate vía 5G | `10.71.111.11`                                                                                   | **"No lo toques"** — un error ahí deja el sitio incomunicado y sin forma de arreglarlo a distancia                                                                                                                                                                                                                           |

## VM de ARGOS en Proxmox — YA ENTREGADA (2026-08-07, reverificada 2026-08-10)

Ya no es una decisión pendiente. VMID 240 (`argos`), en `DIKTYA-SMV-01` (RACK-A, confirmado que
es el rack que viaja — coincide con lo que se había pedido), VLAN 25 `MGMT_SERVICIOS`,
`10.100.25.240/24`, 4 vCPU/8 GB RAM/60 GB disco, Debian 12 + Docker 29.7.2 + Compose v5.4.0.
Detalle completo, specs medidas y las reglas duras que se derivan de esta ubicación → **ver
[[ARGOS Arquitectura y Entrega 2026-08-10]]**, la nota que reemplaza a esta sección como fuente de
verdad. Lo que sigue acá es solo lo que no cambió: DNS interno (`argos.diktya.cl`) **sigue sin
resolver**, y P-59/P-61 (abajo) siguen abiertos.

## Reglas de "no tocar" (gobernanza operativa)

- **MikroTik Chateau**: nunca se toca directo, regla explícita de la documentación real.
- **Ruta EFG de rescate** (`10.100.0.0/16 → 192.168.1.4` en OPNsense): no se modifica sin
  confirmación explícita + backup + dual-write — VLAN 20 es infraestructura crítica. Decisión
  registrada 2026-07-20.
- **`00_DATOS_PRIVADOS/`**: cualquier secreto vive ahí. Nunca se copia su contenido a otro
  documento — regla del propio proyecto, se respeta siempre (esta nota y [[Rutas de Red]] no
  contienen ninguna credencial, solo topología).
- **VLAN / red**: nunca se crea directo — se *reserva*, se hace doble escritura, y se verifica
  leyendo después de cada escritura. Mismo principio que implementa el software (ver
  [[Proyecto Atlas]]).

## Gobernanza del proyecto

- Yo (Claude) opero de forma autónoma en desarrollo y documentación de **ARGOS** (este repo,
  antes llamado "NetBot" — rename 2026-08-10). Según la hoja de entrada del 2026-08-10, el equipo
  hoy son tres: Lucas (operador), yo (el agente) y Francisco — sin escalamiento ni guardia todavía.
- "Codex" (GPT), supervisado por Lucas, no es solo auditor — construye y opera **ATLAS**, una
  plataforma separada (API + colector + Grafana + bot Telegram, ya en producción) sobre esta
  misma infraestructura. Ver [[Plataforma ATLAS (Codex)]] — descubierta el 2026-07-30. **Ya no es
  independiente de ARGOS**: desde el 2026-08-07/10, ARGOS consume su API en vez de sondear los
  equipos directo (revierte la decisión original de independencia).
- Eventos reales requieren un milestone de revisión de seguridad antes del "primer evento real".
- La fase de pruebas corre hasta septiembre (2026).

## Estado actual conocido (2026-07-29)

- **Starlink (WAN_901) sin datos** → sin IP asignada → el túnel WireGuard hacia CORE-01 no
  completa el handshake (confirmado vía API de OPNsense: `addr4: ""` en esa interfaz).
- **UniFi real: alcanzable de facto desde el 2026-07-29** vía `https://10.71.111.101:8443`
  (aparentemente un port-forward en CORE-01, no la ruta ZT gestionada ni el WireGuard
  documentados). No confirmado si es intencional/permanente — no depender de esto para nada
  operativo sin confirmar con Lucas primero. El camino *diseñado* sigue siendo WireGuard
  (bloqueado por Starlink sin datos) — ver [[Rutas de Red]] para el detalle completo de ambos
  caminos.
- **Re-confirmado 2026-07-30, solo lectura** (igual que antes, deliberado — sin escrituras contra
  infra real todavía): mismos 7 dispositivos, todos ONLINE. Además: 47 `Networks`, 21 clientes
  conectados reales, 1 WiFi Broadcast real (`DIKTYA-MNG`). NetBot migró su código de escritura de
  VLANs (`writeWifiNetwork`) a esta misma API, pero esa escritura solo se probó con mocks — nunca
  se ejecutó contra el UDM real. Ver [[OPNsense y UniFi]] para el detalle técnico.
- **API key de solo lectura generada y probada** (2026-07-29, guardada en `apps/backend/.env`
  como `UNIFI_API_KEY`, nunca en este repo/bóveda) — login confirmado contra la API de
  integraciones de UniFi OS (`/proxy/network/integration/v1/...`, header `X-API-KEY`). Site único
  `Default`. **7 dispositivos, todos ONLINE**: `DIKTYA-EFG-01` (gateway), `DIKTYA-SW-BB` (USW Pro
  Max 24 PoE), `DIKTYA-SW-AA` (USW Pro Max 48 PoE), `DIKTYA-CORE-FO-AA`/`DIKTYA-CORE-FO-BB` (USW
  Pro Aggregation, fibra), `UPS 2U`, `U6 IW` (el único AP WiFi propiamente dicho).
  **Pendiente de confirmar**: no está verificado si este key tiene permisos de escritura a nivel
  UniFi o si fue creado explícitamente como solo-lectura — importa para cuando se pruebe
  `writeWifiNetwork`/reboot contra el UDM real por primera vez, podría devolver 403 aunque el
  código esté bien.
- **OPNsense real sí es alcanzable** desde este equipo vía ZeroTier. La key `soporteFD` perdida
  (bloqueo del 2026-08-07) quedó resuelta ese mismo día: Lucas entregó un par key/secret nuevo por
  core (`DIKTYA-CORE-01`/`DIKTYA-CORE-02`, grupo `admins`/`page-all`). **Pero desde el
  2026-08-10 esto es historial, no un camino a seguir**: la arquitectura de ARGOS prohíbe sondear
  OPNsense directo — esas keys quedan reservadas para una futura superficie de escritura
  diseñada explícitamente, no para uso corriente. Ver
  [[ARGOS Arquitectura y Entrega 2026-08-10]] y [[Plataforma ATLAS (Codex)]] § Decisión.

## Ver también

- [[ARGOS Arquitectura y Entrega 2026-08-10]] — la VM real, el rename, y la arquitectura vigente
- [[Proyecto Atlas]] — el software (ARGOS) que opera sobre esta infraestructura
- [[Rutas de Red]] — tabla completa de rutas documentadas (ZeroTier, WireGuard, OPNsense, Proxmox)
- [[Plataforma ATLAS (Codex)]] — la plataforma de Codex que ARGOS consume — ya no independiente
