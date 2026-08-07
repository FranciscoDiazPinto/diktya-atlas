---
tags: [atlas, netbot, codex, infraestructura]
updated: 2026-08-07
---

# Plataforma ATLAS (de Codex) — no confundir con NetBot

Hallazgo del 2026-07-30: existe una plataforma completa y **ya operativa**, separada de NetBot
(este repo), construida por Codex (GPT) bajo supervisión de Lucas, que opera sobre la misma
infraestructura real. Documentada en `~/Descargas/DIKTYA ATLAS/` (no versionada en este repo).
**Grep por "NetBot" en toda esa documentación: cero resultados — los dos sistemas no se conocen
entre sí.**

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

Importante: esa regla es sobre **su** ecosistema de agentes (Telegram + Cloud + skills
especialistas), no una regla que NetBot esté obligado a seguir — son proyectos independientes
(ver decisión abajo).

## Decisión (Francisco, 2026-07-30) — EN REVISIÓN desde 2026-08-07

**NetBot y ATLAS son desarrollos deliberadamente independientes — no se van a unificar.** NetBot
sigue hablándole directo a UniFi vía la Integration API (ver [[OPNsense y UniFi]]), no a través de
la API de ATLAS.

**Objeción real de Lucas (2026-08-07)**, al revisar el plan de VM para NetBot en Proxmox: dos
sistemas sondeando los mismos equipos es doble carga sobre las APIs de los cores/UniFi, dos
fuentes de verdad sobre el estado de la red, y dos bots de Telegram avisando del mismo incidente
— "el día que algo se caiga, ¿cuál tiene razón?". Su recomendación: NetBot consuma la API de
ATLAS (`10.100.25.245:8000`, sin auth) en vez de sondear directo, y así deja de pedir
credenciales de red reales — pasaría a aportar tickets/flujo de trabajo/chat sobre datos que
ATLAS ya recolecta, no a duplicar la recolección.

**Estado (2026-08-07): sin resolver.** El usuario se inclina en primera instancia por revertir la
decisión de independencia y consumir la API de ATLAS, pero quiere confirmarlo con Lucas antes de
cerrarlo — no re-derivar esto como decidido hasta que se confirme. Si se revierte, implica
reescribir la capa `integrations/unifi`/`integrations/opnsense` de NetBot para leer de ATLAS en
vez de hablarle directo a UniFi/OPNsense (el cliente OPNsense real recién implementado hoy, ver
[[OPNsense y UniFi]], quedaría reemplazado, no descartado como trabajo — el contrato
`listNodes`/`listAlerts` es reusable apuntando a otra fuente).

Lo que sí se quiere: que NetBot tenga **capacidad similar construida nativamente** (no
consumiendo la API de ATLAS, no duplicando su código) —

1. **Dashboard visual en el portal de NetBot** — en gran parte ya existe (`/red`, ver
   [[Proyecto Atlas]]), corría en `UNIFI_MODE=mock` hasta esta sesión.
2. **Alertas por Telegram** — ya existía el pipeline (`worker-monitor` → `worker-triage` →
   `notifyTechnicians`), tenía un bug real (chat_id hardcodeado a un string placeholder en vez de
   leer `TELEGRAM_CHAT_ID`) — corregido y probado en real el 2026-07-30.
3. **Auto-remediación por criticidad — implementada 2026-07-31** (`services/autoRemediation.service.ts`).
   AP offline → intenta reset, espera, relee estado; si sigue caído, busca el device en
   pending-devices por MAC y re-adopta; recién si ambos fallan escala a ticket (con nota de qué se
   intentó, para que el técnico no repita pasos). Rompe a propósito la invariante que tenía
   `rebootNode` ("nunca se dispara solo desde un worker") — mitigada por: alcance por tipo de
   dispositivo controlado por Admin (`AUTO_REMEDIATE_DEVICE_TYPES`, default solo AP — no es un rol
   de usuario, no hay nadie autenticado cuando dispara el sistema), cooldown por device (evita loop
   sobre uno que está flapping), y el mismo lock distribuido que ya usaba el reboot manual.
   **Re-adopción es la parte no probada**: no hay forma de validarla contra hardware real sin
   desconectar un equipo a propósito, y puede que el device no conserve su config (SSIDs, VLAN) al
   re-adoptarse — el ticket resultante siempre pide revisión humana cuando pasó por esa rama.
   Workers nuevos (`worker-autoremediate`) no arrancan solos, mismo patrón manual que el resto.

## Ver también

- [[OPNsense y UniFi]] — cómo NetBot habla con UniFi directo (Integration API)
- [[Infraestructura Real]] — los componentes físicos reales, compartidos por ambos sistemas
- [[Proyecto Atlas]] — pendientes conocidos de NetBot
