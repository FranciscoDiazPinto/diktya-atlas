---
tags: [atlas, argos, arquitectura, entrega]
updated: 2026-08-10
---

# ARGOS — Arquitectura y entrega del 2026-08-10

Nota central para lo que llegó en la entrega formal de Lucas del 2026-08-10, carpeta local
`~/Documentos/ENTREGA_FRANCISCO_2026-08-10/` (no versionada en este repo — credenciales y detalle
extenso quedan ahí, no acá; ver `00_DATOS_PRIVADOS/` dentro de esa carpeta para los `.txt` de
acceso). Esta nota resume lo que hay que saber sin releer las ~5 h de documentación completa.
**Empezar por `INDICE_ENTREGA_FRANCISCO.md`** si hace falta más detalle que el de acá.

## El rename: NetBot → ARGOS

Decidido por Lucas + el agente el 2026-08-07, formalizado en esta entrega. **"ATLAS sostiene la
red, ARGOS la vigila."** Convenciones: producto **ARGOS** (mayúsculas en texto comercial, `argos`
en código) · dominio `argos.diktya.cl` · contenedores `argos-backend`/`argos-worker-*`/etc. · VM
en Proxmox llamada `argos`.

**El código de este repo (`package.json`, nombres de servicio, etc.) sigue diciendo "NetBot"** —
el rename de código es trabajo pendiente, no hecho todavía. No asumir que ya se aplicó en ningún
archivo de `apps/` sin verificar.

## La decisión de arquitectura que manda sobre todo lo demás

**ARGOS habla con ATLAS. Nunca directo con OPNsense, UniFi, Proxmox o MikroTik.** Regla dura, no
negociable — ver [[Plataforma ATLAS (Codex)]] para el detalle de por qué se revirtió la
independencia del 2026-07-30. Consecuencias concretas para este repo:

- El `OpnsenseLiveClient` real (sondeo directo, implementado hoy 2026-08-07 antes de esta entrega)
  **queda superado** — no es el camino de producción. Ver [[OPNsense y UniFi]].
- `worker-remediation`/`worker-autoremediate` (`rebootNode` directo sobre UniFi) **quedan
  bloqueados** — la API de ATLAS no tiene ninguna ruta de escritura sobre equipos.
- El próximo cliente real a construir consume las **21 rutas de ATLAS**, no los equipos.

**El segundo requisito que manda, igual de duro**: ARGOS tiene que **operar sin WAN** en el
recinto del evento. Nada de healthchecks contra servicios externos bloqueando el arranque, nada
de `pull` de imágenes al levantar el stack, LLM/Telegram/certificado deben degradar visible, nunca
tumbar el stack. **Hoy esta regla está incumplida** (nada desplegado, sin imágenes
pre-descargadas) — es trabajo pendiente antes de considerar la VM "lista para terreno", no un
error del operador.

## La VM ya existe — no hay que provisionar nada

| | |
|---|---|
| VMID | 240, nombre `argos`, en `DIKTYA-SMV-01` (RACK-A, el rack que viaja a eventos) |
| Red | VLAN 25 `MGMT_SERVICIOS`, IP `10.100.25.240/24` — **misma subred que la API de ATLAS** (`10.100.25.245`), sin ruteo, sin firewall de por medio |
| Gateway/DNS/NTP | `10.100.25.254` — la **VIP CARP** (no `.253`, que es la IP física de CORE-01 y muere en un failover). DNS y NTP resuelven local vía Unbound de los cores — funciona sin internet |
| SO / Docker | Debian 12, Docker 29.7.2, Compose v5.4.0 (plugin), verificado con `hello-world` |
| Directorio de trabajo | `/opt/argos`, vacío, propiedad `argos:argos` |
| Recursos | 4 vCPU / 8 GB RAM (7,8 usable) / 60 GB disco (59 usable, 3% en uso) |
| Usuario `argos` | grupos `docker` (sin `sudo` para Docker) y `sudo` sin contraseña (para el resto) |
| Llaves SSH autorizadas | `claude-ops@diktya-atlas` + `francisco@diktya` |
| Único puerto pensado para publicar | 443 (Caddy) — Postgres/Redis/backend/workers solo en red interna de Docker |
| `argos.diktya.cl` | **no resuelve todavía** — falta el *host override* en Unbound, pendiente del operador |

**Latencia real medida VM → API de ATLAS: 1,19 ms** (misma subred). Por comparación, la misma
llamada por ZeroTier tarda 236 ms. Esa es la justificación medida de por qué la VM vive en la
VLAN 25 y no se accede a la API por el overlay.

## Cómo entra Francisco (desarrollo) — separado de cómo funciona ARGOS (producción)

**Dos planos distintos, no mezclar:**
- **ZeroTier es solo la vía de desarrollo remoto** (`ssh -p 2240 argos@10.71.111.101`, redirect
  `rdr pass` en CORE-01, acotado al alias `ZT_DEV_FRANCISCO`). Confirmado funcionando en vivo el
  2026-08-10 desde esta máquina (ping, SSH banner, API, UniFi bridge — los 4 checks pasaron).
- **La VLAN 25 es cómo ARGOS funciona de verdad**, sin overlay, sin depender de que Francisco (o
  nadie) esté conectado a nada. Regla explícita: **nunca meter un cliente ZeroTier dentro de la
  VM**, ni usar `10.71.111.x` como IP de nada del stack — ese rango es el overlay, no una VLAN.

**Punto único de fallo real, no el que se pensaba**: `10.71.111.102:8000` (CORE-02) **no es un
segundo ATLAS** — redirige al mismo `mon-aa` que `.101`. Si `mon-aa` cae, las dos rutas por
ZeroTier caen juntas. Y los redirects de SSH (`2240`) y UniFi (`8443`) **solo existen en CORE-01**
(P-61, CORE-02 tiene el NAT saliente en modo automático) — si CORE-01 cae, Francisco pierde acceso
remoto a la VM, aunque la VM y ARGOS sigan funcionando normalmente en el recinto (no dependen de
CORE-01 para operar, solo para que Francisco la administre a distancia).

## `mon-bb` no es un failover de la API — no diseñar como si lo fuera

| | `mon-aa` (`10.100.25.245`, alcanzable por ZT vía `.101` **y** `.102`) | `mon-bb` (`10.100.25.244`, **no alcanzable por ZeroTier**) |
|---|---|---|
| Versión | 0.3.0-m3 | 0.2.0-m1 |
| Rutas | 21 | 6: `/health` `/version` `/status` `/status/network` `/status/unifi` `/status/proxmox` |
| Falta | — | `/events` `/alerts` `/inventory` `/energia` `/telemetry/now` `/history` `/rf/analysis` `/traffic/*` `/clients/*` `/buscar*` — todo 404 |

Trampa: `/status/proxmox` en `mon-bb` da **HTTP 200** con
`{"ok":false,"error":"no implementado..."}` — un cliente que valide solo por código HTTP lo da por
bueno. Validar por el campo `ok`. Decisión pendiente del operador (`P-116`): declarar formalmente
que no hay failover, o desplegar M3 en `mon-bb` para que exista de verdad.

## Contrato de la API de ATLAS — lo que rompe código si no se contempla

Fuente completa: `Operacion/DIKTYA_ATLAS_CONTRATO_API.md` dentro de la carpeta de entrega (21
rutas, formas de respuesta, timeouts, catálogo de errores, §8 "lo que la API NO expone" —
consultar ahí al escribir el cliente real, no memorizar). **Sin autenticación hoy** (P-40,
aceptado mientras sea 100% lectura) — **va a cambiar**, dejar un punto de inserción para
credencial en el cliente desde el día uno.

Los 5 cambios de forma que rompen un cliente escrito antes del 2026-08-09:

1. **Salud del HA**: `d["ha_ok"]` (raíz de `/status`, booleano) + `d["carp"]["resumen"]` (texto,
   ej. `"44/44 VIP emparejadas"`). 🔴 `carp.ha_ok` **no existe**, es `KeyError`. `carp_master`/
   `carp_backup` siguen existiendo pero ya no son el criterio — son materia prima, un split-brain
   simétrico pasa el recuento igual.
2. **`alerts[].detail`** de la regla `ha_carp` cambió de forma y **las dos conviven en el
   histórico** — usar `.get("resumen")` con respaldo, nunca indexar directo. `detail.antes` puede
   ser `int` o `str`.
3. **Evento `carp_change`**: `entity` pasó de `"CORE-01"` a `"cores"` (la alerta `ha_carp` ya
   usaba `"cores"` antes — lo que cambió es el evento). Nunca se ha emitido uno nuevo desde el
   parche, así que hoy en base solo existe la forma vieja.
4. **`/energia`**: ya no es solo `ups` — trae `fuentes` (con `ok`/`error` cada una) y `degradado`
   (hay datos pero falta una fuente, no es lo mismo que `ok:false`). `"ui-ups"` como clave **ya no
   existe** — la UPS Ubiquiti se identifica ahora por número de serie; iterar `d["ups"].items()`,
   nunca el literal. Timeout ≥ 30 s — se midió una llamada de 14,97 s sana, sin degradación.
5. **`detail` de una alerta abierta se refrescaba con cada pasada del colector** desde un cambio
   reciente — no cachear el primer valor leído.

Lección de código que vale para lo que se escriba en ARGOS: **`x or DEFECTO` en Python (o el
equivalente en TS, `x || DEFECTO`) no distingue ausente de cero** — la regla de alerta más crítica
del sistema estuvo muda en el peor valor posible (`0 or 999 = 999`) toda su vida útil por ese bug.
Usar `is None`/`??` explícito para defaults numéricos.

## Lo que hoy limita a ARGOS — con pendiente y dueño

| Qué | Efecto | Pendiente |
|---|---|---|
| `mon-bb` no es respaldo de API | Sin failover si cae `mon-aa` | `P-116`, decisión del operador |
| API de ATLAS sin autenticación | Aceptado hoy (100% lectura); va a cambiar | `P-40` / `P-40a` |
| Redirects `2240`/`8443` solo en CORE-01 | Sin acceso remoto a la VM ni consola UniFi si cae CORE-01 (no afecta la operación en el recinto) | `P-61` |
| `argos.diktya.cl` no resuelve | Sin nombre para TLS interno | Host override pendiente en Unbound |
| Nada desplegado, sin imágenes pre-descargadas | La regla "opera sin WAN" está incumplida hoy | Trabajo de ARGOS, no del operador |
| `worker-remediation`/`worker-autoremediate` sin API de escritura a la que llamar | Auto-remediación real bloqueada hasta M5 de ATLAS | Decisión de diseño pendiente: ¿proponen en vez de ejecutar? |

## Verificado en vivo desde esta máquina, 2026-08-10

Los 4 primeros checks del onboarding, corridos hoy — todos en verde:

- ZeroTier conectado (`10.71.111.130/24`), ping OK a `10.71.111.101` y `10.71.111.201`.
- API de ATLAS responde en `.101` y `.102` (los dos `"node":"atlas-mon-aa"`, confirmando que son
  el mismo nodo) — `/openapi.json` da `0.3.0-m3`, 21 rutas.
- `/status` da `ha_ok: True`, `carp.resumen: "44/44 VIP emparejadas"`, sin problemas.
- SSH (banner) y UniFi (`8443`, HTTP 200) responden por los redirects de CORE-01.

**Esto cierra el único pendiente que la entrega dejaba abierto para Francisco**: "SIN CONFIRMAR —
tu IP no se vio en la tabla ARP de CORE-01". Avisar a Lucas que quedó confirmado.

## Cliente de la API de ATLAS — construido y validado (2026-08-10, tarde)

`apps/backend/src/integrations/atlas/` — tipos fieles al contrato (`types.ts`) y cliente HTTP
(`client.ts`, `AtlasHttpClient`) para las 21 rutas, con `MockAtlasClient` para tests/dev
(`ATLAS_MODE=mock|live` + `ATLAS_HOST` en env, mismo patrón que `UNIFI_MODE`/`OPNSENSE_MODE`).
Cubre los gotchas del contrato directamente en el tipo/cliente: HA vía `ha_ok`/`carp.resumen` (no
`carp_master`/`carp_backup`), timeouts por categoría (30 s `/energia`, 15 s `/status/proxmox`,
10 s familia `/status`, 5 s el resto), `200` con `ok:false` tratado como dato — no como error — y
un punto de inyección de cabeceras para cuando la API sume autenticación (P-40). Validado en vivo
contra la API real por ZeroTier: HA sano, 7/7 UniFi, 48 redes, 23 clientes, coincide con el
contrato.

**No implementados a propósito**: `GET /panel` (HTML para humanos, no dato) y
`POST /correo/prueba` (única escritura, no idempotente, el contrato dice explícito "no la llames
desde código automático").

## `worker-monitor` y `/opnsense/status` ya consumen ATLAS (2026-08-10, misma tarde)

`worker-monitor.ts` sincroniza `NetworkNode` desde `/inventory` de ATLAS (antes: `listNodes()`
directo a UniFi). `opnsense.service.ts` (backend de `GET /opnsense/status`) deriva CORE-01/CORE-02
de `network.C1/C2.ok` y las alertas de `/alerts`, vía `integrations/atlas/normalize.ts`. Validado
en vivo end-to-end: 7 equipos reales sincronizados con el tipo de dispositivo bien inferido, HA
online en los dos cores, `curl /opnsense/status` responde 200 con datos reales.

**Pérdida de fidelidad real y documentada** (no oculta, `/inventory` no da estos datos — confirmado
contra el contrato §8.7): sin MAC/ID estable por equipo (`id` cae a `equipo.name`, renombrable —
un rename en UniFi crea una fila nueva en vez de actualizar la existente), sin clientes conectados
por equipo, sin SSIDs por AP. Al hacer el swap, la base de dev quedó con 7 filas duplicadas (las
viejas por UUID de UniFi, ya no tocadas por nada) — limpiadas manualmente esa misma sesión.

**Deliberadamente sin tocar todavía** — necesitan una decisión de diseño, no son un olvido:
- `routes/network.ts`: `getLiveWifiNetworks` (panel de VLANs — ATLAS no expone el equivalente a
  WiFi Broadcasts/VLAN de UniFi), `diagnoseNode`, `rebootNode` (escritura — ATLAS no tiene ninguna
  ruta de escritura sobre equipos).
- `autoRemediation.service.ts` / `workers/remediation.logic.ts`: mismo problema de escritura,
  bloqueados hasta decidir "proponer vs. esperar a M5" (ver [[Plataforma ATLAS (Codex)]] § Decisión).

`ATLAS_MODE=live` + `ATLAS_HOST=10.71.111.101:8000` (vía ZeroTier) ya en `apps/backend/.env` de
este equipo — mismo criterio que `UNIFI_MODE=live`.

## Ver también

- [[Plataforma ATLAS (Codex)]] — la plataforma que ARGOS consume, y la historia de la decisión de arquitectura
- [[OPNsense y UniFi]] — implementación anterior de sondeo directo (superada)
- [[Despliegue a Producción]] — estado del deploy de ARGOS sobre esta VM
- [[Infraestructura Real]] — componentes físicos reales
