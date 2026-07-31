---
tags: [atlas, netbot, opnsense, unifi]
updated: 2026-07-30 (noche)
---

# OPNsense y UniFi (en el software)

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
que ya existe (`soporteFD`) — pendiente decisión de conectarlo de verdad. Real UniFi **sí es
alcanzable** desde el equipo de desarrollo — desactualizado desde 2026-07-29, ver
[[Infraestructura Real]]/[[Rutas de Red]] para el detalle del camino (port-forward de facto en
CORE-01, no la ruta WireGuard diseñada).

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
