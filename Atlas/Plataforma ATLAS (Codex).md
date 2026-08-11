---
tags: [atlas, argos, codex, infraestructura]
updated: 2026-08-10
---

# Plataforma ATLAS (de Codex) — no confundir con ARGOS (antes "NetBot")

> **Rename 2026-08-10**: el software de este repo (llamado "NetBot" hasta ahora) pasó a llamarse
> **ARGOS** — decisión de Lucas + el agente del 2026-08-07, documentada en la entrega formal del
> 2026-08-10. Motivo textual: *"ATLAS sostiene la red, ARGOS la vigila"* — dos productos con
> nombres de familias distintas se leen como herramientas sueltas; con nombres de la misma familia
> se leen como un sistema. Ver [[ARGOS Arquitectura y Entrega 2026-08-10]] para el detalle
> completo. Este repo (código, `package.json`, etc.) **todavía dice "NetBot" en varios lugares** —
> el rename de código es trabajo pendiente, no asumir que ya se hizo.

Hallazgo del 2026-07-30: existe una plataforma completa y **ya operativa**, separada de ARGOS
(este repo), construida por Codex (GPT) bajo supervisión de Lucas, que opera sobre la misma
infraestructura real. Documentada externamente (fuente actual: entrega formal en
`~/Documentos/ENTREGA_FRANCISCO_2026-08-10/`, no versionada en este repo — la ruta vieja
`~/Descargas/DIKTYA ATLAS/` ya no existe, ver [[reference_atlas_obsidian_vault]]).

## Qué es

API FastAPI + colector propio + observabilidad, corriendo en LXC sobre Proxmox (`mon-aa`/`mon-bb`,
`10.100.25.245`/`.244`, ver [[Infraestructura Real]]). API real en `10.100.25.245:8000`
(confirmado por Lucas 2026-08-07, ya con **21 rutas** — creció desde las ~10 documentadas acá el
2026-07-30):

| Componente | Estado (verificado 2026-07-27) |
|---|---|
| API ATLAS (FastAPI), `atlas-api.service` | ✅ operativo |
| Colector — polling cada 2 min → PostgreSQL | ✅ operativo |
| Bot Telegram (`@diktya_atlas_bot`), `atlas-bot.service` | ✅ operativo, 15/15 comandos |
| Grafana (`:3000`) | ✅ operativo, 4 paneles |
| Loki + promtail + rsyslog | ✅ operativo |
| NetFlow (pmacct/nfacctd) | ✅ operativo |
| Redis | ✅ operativo |

Endpoints de lectura ya disponibles (`GET /docs` para Swagger): `/status`, `/telemetry/now`,
`/history`, `/events`, `/alerts`, `/inventory` (equipos + 47 redes + nº clientes — mismos números
que confirmé independientemente contra la Integration API de UniFi, ver [[OPNsense y UniFi]]),
`/rf/analysis`, `/clients/{mac}/timeline`, `/health`, `/version`. **Sin escritura todavía** (falta
M2 ChangeSet + M5) y **sin autenticación** (aceptado mientras sea 100% lectura en segmento
cerrado — bloqueante antes de escribir).

## La regla de oro de su arquitectura (textual del contrato de API)

> Los agentes hablan con ATLAS. Nunca directo a OPNsense, UniFi o Proxmox. ATLAS es el único que
> toca los equipos.

Esa regla textual de su contrato de API terminó siendo, palabra por palabra, la que Lucas impuso
también para ARGOS (ver decisión abajo) — dejaron de ser reglas de ecosistemas distintos.

## Decisión — RESUELTA 2026-08-07, formalizada en la entrega del 2026-08-10

**Revertida la independencia del 2026-07-30.** Regla dura, sin ambigüedad, del propio documento
de arquitectura de ARGOS: **"ARGOS habla con ATLAS. Nunca directo con OPNsense, UniFi, Proxmox o
MikroTik."** Motivo (mismo que había objetado Lucas el 07-08): doble sondeo sobre los mismos
equipos, dos fuentes de verdad, y sobre todo — **las credenciales de red nunca salen de ATLAS**.
ARGOS no vuelve a pedir ni guardar credenciales de UniFi/OPNsense/Proxmox.

**Consecuencia directa para el código de este repo**: la capa `integrations/unifi` y el
`OpnsenseLiveClient` real implementado el 2026-08-07 (ver [[OPNsense y UniFi]]) quedan
**superados por la arquitectura** — no es el camino de producción. Se mantienen como trabajo no
perdido (mismo contrato `listNodes`/`listAlerts`, reusable apuntando a datos de ATLAS en vez de
hablarle a los equipos), pero **no hay que seguir construyendo sobre sondeo directo**. El próximo
paso real es un cliente que consuma las 21 rutas de ATLAS (`GET http://10.100.25.245:8000` desde
la VM de ARGOS, misma VLAN 25 — ver [[ARGOS Arquitectura y Entrega 2026-08-10]] para el contrato
completo).

**Excepción documentada, no para hoy**: ARGOS sí tiene una cuenta `admins`/`page-all` en OPNsense
("el agente que desarrollas necesitará escribir" — texto del onboarding), reservada para cuando
exista una superficie de escritura diseñada explícitamente. Hoy sigue prohibido usarla para
sondear o escribir por fuera de ATLAS.

Lo que sí se quiere: que ARGOS tenga **capacidad similar construida nativamente** (no
duplicando el código de ATLAS, consumiendo sus datos) —

1. **Dashboard visual en el portal de ARGOS** — en gran parte ya existe (`/red`, ver
   [[Proyecto Atlas]]), corría en `UNIFI_MODE=mock` hasta el 2026-08-03. **Pendiente**: reconstruir
   la fuente de datos sobre la API de ATLAS en vez del sondeo directo actual.
2. **Alertas por Telegram** — ya existía el pipeline (`worker-monitor` → `worker-triage` →
   `notifyTechnicians`), tenía un bug real (chat_id hardcodeado a un string placeholder en vez de
   leer `TELEGRAM_CHAT_ID`) — corregido y probado en real el 2026-07-30. **Regla nueva del
   2026-08-10**: si ARGOS notifica, que sea de tickets/flujo de trabajo — nunca duplicando alertas
   de red, que ya cubre el bot de ATLAS (15 comandos).
3. **Auto-remediación por criticidad — implementada 2026-07-31** (`services/autoRemediation.service.ts`),
   **ahora bloqueada por la arquitectura del 2026-08-10**: llama `rebootNode`/re-adopción directo
   sobre UniFi, exactamente el sondeo/escritura directa que la regla dura prohíbe. La API de ATLAS
   no tiene ninguna ruta de escritura sobre equipos (solo `POST /correo/prueba`) — las escrituras
   reales son el hito M5 de ATLAS, bloqueado por falta de autenticación (P-40). Dos salidas
   documentadas por Lucas, ninguna decidida todavía: (a) que los workers *propongan* la acción y un
   humano la apruebe, o (b) que esperen a M5 y no existan mientras tanto. **No debe seguir
   escribiendo directo tal como está.**

## Ver también

- [[ARGOS Arquitectura y Entrega 2026-08-10]] — arquitectura vigente, VM ya provista, contrato de API
- [[ATLAS — Rutas faltantes para ARGOS]] — lista concreta y auditada contra el código (2026-08-11)
  de qué rutas le faltan a ATLAS para que los tres puntos de auto-remediación/VLAN/reboot de acá
  arriba dejen de hablarle directo a UniFi
- [[OPNsense y UniFi]] — implementación anterior de sondeo directo, superada por la arquitectura de arriba
- [[Infraestructura Real]] — los componentes físicos reales, compartidos por ambos sistemas
- [[Proyecto Atlas]] — pendientes conocidos de ARGOS
