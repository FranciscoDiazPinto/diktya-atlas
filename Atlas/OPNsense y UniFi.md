---
tags: [atlas, argos, opnsense, unifi, mobility, superado]
updated: 2026-08-10
---

# OPNsense y UniFi (en el software) — SUPERADO por la arquitectura del 2026-08-10

> ⚠️ **Todo lo de abajo describe sondeo directo contra UniFi/OPNsense — arquitectura que la
> entrega formal del 2026-08-10 prohíbe explícitamente.** Regla dura: *"ARGOS habla con ATLAS.
> Nunca directo con OPNsense, UniFi, Proxmox o MikroTik."* Ver
> [[ARGOS Arquitectura y Entrega 2026-08-10]] y [[Plataforma ATLAS (Codex)]] § Decisión. Se deja
> esta nota completa como **historial técnico** (el trabajo de `liveClient.ts` no se pierde, el
> contrato `listNodes`/`listAlerts` es reusable apuntando a la API de ATLAS) — no seguir
> construyendo sobre este sondeo directo. El próximo cliente real consume las 21 rutas de ATLAS.

Módulo de [[Proyecto Atlas]] — vista `/infra` (**solo Admin**, bloqueado a nivel de ruta en el
frontend, no solo botón oculto). No confundir con la infraestructura real — ver
[[Infraestructura Real]] y [[Rutas de Red]] para eso.

## UniFi

Cliente real vs. mock intercambiable por `UNIFI_MODE`. **Pasó a `live` la noche del 2026-07-30**
(antes `mock` por defecto) — decisión explícita del usuario, sin esperar al milestone de
revisión de seguridad (ese milestone sigue pendiente, ver [[Infraestructura Real]] § gobernanza).
Con esto: reboot real y escritura real de VLAN quedan habilitados si algo los dispara desde la
app (botón en `/red`, o `apply_vlan_plan` desde el chat). Los 2 nodos mock de demo (`AP
Recepción`/`AP Bodega`) se borraron de Postgres esa misma noche — `/red` ya muestra solo los 7
dispositivos reales, con íconos por tipo (`tipoDispositivo`: AP/SWITCH/GATEWAY/UPS).

El estado que se ve en `/red` (todos los roles) viene de **Postgres**, sincronizado desde el
cliente (`worker-monitor`) — no se lee en vivo del controlador en cada request. Al cierre de la
sesión del 2026-07-30, `worker-monitor` (y el resto de los workers) **no estaban corriendo
continuo** — solo se hizo una sincronización manual puntual. Confirmar al retomar si hace falta
levantarlos.

**Migración 2026-07-30 — WLANs, nodos y reboot pasaron a la Integration API real** (antes
`integrations/unifi/liveClient.ts` completo usaba la API clásica, cookie + `/api/s/{site}/...`,
que asume un controller self-hosted). El UDM real (`Enterprise Fortress Gateway`) corre UniFi OS,
no el controller clásico, y esas rutas no coinciden. `listAlerts` es la única función que sigue en
la API clásica (la Integration API no expone alarmas todavía, 404 confirmado, no 403) —
**nunca se validó contra el UDM real**, probablemente tenga el mismo problema de rutas.

Validado en vivo, solo lectura, contra el UDM real (`10.71.111.101:8443`):
- **7 dispositivos, todos ONLINE** (gateway, 4 switches, 1 UPS, 1 AP real — `U6 IW`).
- **47 `Networks`**, **21 clientes conectados reales**, **1 `WiFi Broadcast`** real (`DIKTYA-MNG`,
  WPA2_PERSONAL, 5GHz+2.4GHz).

Dos bugs reales que salieron de esa validación (ya corregidos):
1. El GET/PUT de un recurso individual (`GET .../wifi/broadcasts/{id}`, `GET .../devices/{id}/statistics/latest`)
   devuelve el objeto **directo**, no envuelto en `{data: ...}` como sí hacen los listados
   paginados — asumir lo mismo para ambos rompía `writeWifiNetwork` de raíz.
2. El campo `network` de un WiFi Broadcast (a qué `Network`/VLAN pertenece) puede estar
   **ausente** (no `null`) cuando usa la red nativa del sitio — el spec de OpenAPI lo marcaba
   como opcional pero no lo decía explícito en el schema del overview; el broadcast real
   `DIKTYA-MNG` lo confirmó.

**`writeWifiNetwork` solo reasigna VLAN de un SSID que ya existe — nunca crea uno nuevo.** El PUT
de esta API exige el objeto completo, incluida `securityConfiguration` (WPA/passphrase), y NetBot
no tiene de dónde sacar una seguridad válida para un SSID nuevo sin inventarla (regresión de
seguridad silenciosa). Si el SSID o la VLAN destino no existen, se lanza
`AutomatedWifiWriteNotSupportedError` y `worker-remediation` crea un ticket de creación manual en
vez de reintentar — mismo patrón que ya usaba para doble-escritura.

## OPNsense

Existía como stub sin implementar (`OpnsenseClientStub`, "fase 2" — cada método tira error a
propósito, nunca finge datos). Se agregó:

- `MockOpnsenseClient` — mismo contrato que `UnifiClient`, seedeado con CORE-01/CORE-02 de
  ejemplo. `OPNSENSE_MODE=mock` por defecto.
- `GET /opnsense/status` (solo Admin) — a diferencia de UniFi, esto se lee **en vivo** del
  cliente en cada request, no vía Postgres (no hay pipeline de sync todavía, no hace falta para
  un panel de estado puntual).

**Decisión de alcance explícita** (2026-07-28): por ahora se construyó solo contra mock. Real
OPNsense (CORE-01/CORE-02, HA) **es alcanzable hoy vía ZeroTier** con la API key de solo lectura
que ya existía (`soporteFD`) — pendiente decisión de conectarlo de verdad. Real UniFi **sí es
alcanzable** desde el equipo de desarrollo — desactualizado desde 2026-07-29, ver
[[Infraestructura Real]]/[[Rutas de Red]] para el detalle del camino (port-forward de facto en
CORE-01, no la ruta WireGuard diseñada).

**Bloqueado (2026-08-07): key `soporteFD` perdida, cuenta web de solo lectura.** Al retomar la
conexión real de OPNsense (el "próximo paso" de arriba), el usuario encontró: (1) el secret de la
API key `soporteFD` no está guardado en ningún lado accesible — ni en `apps/backend/.env` (que no
tiene ninguna línea `OPNSENSE_*`, a diferencia de `UNIFI_API_KEY` que sí quedó en `.env`), ni en
este vault, ni en memoria de Claude (por diseño, nunca se copian secretos acá — ver
[[Infraestructura Real]] § "no tocar"). OPNsense solo muestra el secret una vez al crearlo, así
que no es recuperable — hay que generar un par nuevo. (2) Al loguearse por navegador con su propio
usuario, el rol es **solo lectura** — coherente con que `soporteFD` se creó deliberadamente así
"solo para diagnóstico puntual, nunca para escribir", pero eso también le impide generar una key
nueva por su cuenta. Necesita que alguien con más privilegio en CORE-01/CORE-02 le eleve el rol o
genere la key — según la gobernanza documentada, ese es un llamado de **Lucas** (supervisa la
infra real, ver [[Infraestructura Real]] § gobernanza), mismo patrón de bloqueo que
[[WhatsApp y credenciales de invitados]].

**Cómo aplicar al retomar**: preguntar primero si la conversación con Lucas sobre elevar el rol
(o generar una key nueva con los permisos que haga falta para fase 2) ya se resolvió, antes de
re-intentar conectar OPNsense real desde cero.

## Dashboard de disponibilidad (2026-07-31)

Sección nueva arriba de las cards operativas en `/infra` — a diferencia del resto del panel (que
es estado en vivo), esto es **histórico**: disponibilidad real por rango de fechas, no una foto de
ahora.

**Modelo nuevo, `NodeStatusEvent`** — un registro por *cambio* de estado de un nodo (no por poll;
`nodeSync.service.ts` lo inserta solo cuando `status` difiere del sync anterior, incluido el primer
sync de un nodo nuevo, que cuenta como el punto de partida de su historial). `NetworkNode.status`
seguía siendo la foto actual sin historial — esto le agrega la serie temporal que faltaba.

`nodeAvailability.service.ts` reconstruye, caminando la línea de tiempo de eventos de cada nodo:
- **% de disponibilidad** por nodo y promedio general.
- **Serie temporal** (48 puntos muestreados en el rango) — % de nodos online en cada momento, para
  el chart de "historial de conexión".
- **Histograma de duración de cortes** (`< 1 min` / `1–5 min` / `5–15 min` / `15–60 min` / `> 1 h`).

**"Sin datos" ≠ 0%** — el tramo antes del primer evento conocido de un nodo (o, si nunca tuvo
ningún evento, todo el rango) se excluye del cálculo en vez de contar como downtime. Si no hay
ningún nodo con datos en el rango, el promedio general también es `null`, no `0`.

`GET /reports/availability` — gateado `requireRole("ADMIN")`, mismo criterio que `/opnsense/status`
y `/unifi-os/status` (los otros endpoints que alimentan `/infra`); a diferencia de esos, sí lee de
Postgres (vía `NodeStatusEvent`), no en vivo del controlador.

**Backfill manual (2026-07-31)**: los 7 nodos que ya existían en Postgres antes de esta migración
no tenían ningún `NodeStatusEvent` — sin backfill hubieran quedado en "sin datos" indefinidamente
hasta su primer cambio de estado real post-deploy (que puede tardar días si nada se cae). Se
insertó un evento baseline (su `status` actual, timestamp del backfill) para los 7 vía script
puntual, mismo criterio que "primer sync de un nodo nuevo".

**Sin librería de gráficos** (`apps/frontend/package.json` no tiene recharts/d3/visx/victory) — el
chart de línea/área (`ConnectionHistoryChart.tsx`) y el histograma (`OutageHistogramChart.tsx`) son
SVG a mano siguiendo la skill de dataviz del repo (2px línea, ~10% opacity el fill de área, barras
con 4px de radio, gridlines hairline, crosshair + tooltip por barra, fallback de tabla). Los huecos
"sin datos" cortan el path en tramos en vez de interpolar a través de ellos.

**Bug real encontrado en la verificación visual**: un tramo de un solo punto (caso común recién
después del backfill/deploy, cuando casi todo el rango pedido todavía es "sin datos" y solo el
último instante tiene dato) no pintaba nada — un `path` con un solo `M x y` sin `L` es invisible.
Se corrigió agregando un marcador (dot) permanente en el último punto de cada tramo, no solo al
hacer hover.

**Velocidad de internet quedó deliberadamente afuera** — no hay integración OPNsense real ni
mecanismo de speedtest en el código (ver más arriba, "Decisión de alcance explícita"), así que no
había datos sobre los que construir ese gráfico. Decisión explícita del usuario de no construirlo
sobre una base inexistente en vez de simularlo.

## UniFi Mobility (2026-08-03)

Card nueva en `/infra`, debajo de "UniFi (real)" — estado de routers móviles/de viaje (UMR:
`UMR`/`UMR Industrial`/`UMR Ultra`), organizados en "workspaces". **Producto y API totalmente
distintos** de todo lo de arriba: es la API cloud pública de UniFi Mobility
(`https://api.ui.com`, auth `X-API-Key` con scope `mobility`, ver `developer.ui.com/mobility`),
no la Integration API de red ni OPNsense — no comparte host, key, ni modelo de datos con nada de
lo existente.

`integrations/mobility/client.ts` implementa **solo lectura**: `listWorkspaces`, `listDevices`,
`getDeviceDetail`, `listDeviceClients`. El spec también define PUT de escritura (renombrar
device, LAN/DHCP, WiFi) — **deliberadamente no implementados**, esto es para ver estado, no para
controlar remoto.

`GET /mobility/status` (solo Admin) da un resumen liviano (workspaces + devices, sin el detalle
completo por device) para no generar un fan-out de N llamadas solo para pintar una lista;
`GET /mobility/workspaces/:workspaceId/devices/:deviceId` da el detalle completo (señal LTE, VPN,
ubicación GPS si hay fix, uso de datos celulares) + clientes conectados, bajo demanda — expuesto
en el backend pero todavía sin consumir desde el frontend (v1 solo muestra la lista con estado).

**Sin `UNIFI_MOBILITY_API_KEY` configurada todavía** — la card muestra correctamente el estado
"no configurado" (503 del backend), mismo patrón que `UnifiOsRealCard`: sin refetch automático,
botón "Consultar ahora" porque es tráfico real contra un servicio cloud externo.

## VLANs en `/red` ahora también en vivo (2026-08-03)

No es este panel (`/infra`), pero mismo cliente: el panel de VLANs de `/red` pasó de leer
`WifiNetwork` en Postgres (tabla que nunca escribe nadie — confirmado) a `listWifiNetworks()`
bajo demanda, igual criterio que `UnifiOsRealCard` acá arriba. Detalle completo →
[[Proyecto Atlas]] § Estado actual.

## "Solicitar cambio"

No ejecuta nada directo sobre infraestructura real — crea un ticket (`POST /tickets`, ruta REST
nueva, antes solo existía como tool del LLM) que un técnico toma después. Mismo patrón de
"proponer, no escribir" que usan las VLANs (ver [[Proyecto Atlas]], arquitectura de seguridad).

## Ver también

- [[Proyecto Atlas]] — el resto del software
- [[Infraestructura Real]] — los componentes reales detrás de este panel
- [[Rutas de Red]] — el camino de acceso a cada uno
- [[Plataforma ATLAS (Codex)]] — sistema aparte, no relacionado con este módulo, que ya opera
  sobre la misma infraestructura real — leer para no duplicar ni confundir con esto
