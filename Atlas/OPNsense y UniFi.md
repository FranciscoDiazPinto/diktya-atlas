---
tags: [atlas, netbot, opnsense, unifi]
updated: 2026-07-29
---

# OPNsense y UniFi (en el software)

Módulo de [[Proyecto Atlas]] — vista `/infra` (**solo Admin**, bloqueado a nivel de ruta en el
frontend, no solo botón oculto). No confundir con la infraestructura real — ver
[[Infraestructura Real]] y [[Rutas de Red]] para eso.

## UniFi

Cliente real vs. mock intercambiable por `UNIFI_MODE` (`mock` por defecto). El estado que se ve
en `/red` (todos los roles) viene de **Postgres**, sincronizado desde el cliente — no se lee en
vivo del controlador en cada request.

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
que ya existe (`soporteFD`) — pendiente decisión de conectarlo de verdad. Real UniFi **no es
alcanzable** desde el equipo de desarrollo (ver [[Rutas de Red]] para el porqué exacto).

## "Solicitar cambio"

No ejecuta nada directo sobre infraestructura real — crea un ticket (`POST /tickets`, ruta REST
nueva, antes solo existía como tool del LLM) que un técnico toma después. Mismo patrón de
"proponer, no escribir" que usan las VLANs (ver [[Proyecto Atlas]], arquitectura de seguridad).

## Ver también

- [[Proyecto Atlas]] — el resto del software
- [[Infraestructura Real]] — los componentes reales detrás de este panel
- [[Rutas de Red]] — por qué OPNsense real es alcanzable hoy y UniFi real no
