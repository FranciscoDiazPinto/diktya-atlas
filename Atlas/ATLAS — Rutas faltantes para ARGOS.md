---
tags: [atlas, argos, contrato-api, pendiente-lucas]
updated: 2026-08-11
---

# ATLAS — rutas faltantes para que ARGOS deje de hablarle directo a UniFi

Nota de trabajo para Lucas: lista concreta de todo lo que el código de ARGOS necesita hoy y que
la API de ATLAS todavía no expone. Mientras esto no se resuelva del lado de ATLAS, estas
funciones **se quedan bloqueadas o hablando directo a UniFi** — decisión explícita del
2026-08-11: no se construyen workarounds en ARGOS para saltarse la regla de oro
(*"ARGOS habla con ATLAS. Nunca directo con OPNsense, UniFi, Proxmox o MikroTik"*, ver
[[Plataforma ATLAS (Codex)]]). Esto es lo que falta para que la regla se pueda cumplir de verdad,
no una lista de excepciones a mantener.

Auditado contra el código real el 2026-08-11 (no contra diseño/intención) — cada ítem dice
exactamente qué archivo lo usa hoy.

## Lecturas que faltan

| Falta en ATLAS | Para qué la usa ARGOS hoy | Dónde |
|---|---|---|
| Listar redes WiFi/SSID de un sitio con su VLAN asignada | Panel de redes WiFi en vivo | `network.service.ts::getLiveWifiNetworks` |
| Buscar una red WiFi puntual por sitio+SSID (con VLAN actual) | Diff del plan de VLAN generado desde CSV (`propose_vlan_plan`) | `planDiff.service.ts::generateVlanPlan` |
| Detalle/estado en vivo de un dispositivo puntual por ID | Diagnóstico manual bajo demanda de un nodo | `network.service.ts::diagnoseNode` |
| Detalle/estado en vivo de un dispositivo puntual por ID (mismo dato) | Confirmar si un equipo caído volvió online antes/después del reset | `autoRemediation.service.ts::intentarRecuperar` |
| Listar dispositivos en estado "pendiente de adopción" | Paso de re-adopción de la auto-remediación cuando el reset no alcanza | `autoRemediation.service.ts::intentarRecuperar` |

Nota sobre el primer y tercer ítem: ATLAS ya expone `/inventory` con equipos y redes, pero sin
el detalle por-SSID-con-VLAN ni el detalle live por-dispositivo que estos casos necesitan — no es
que falte el concepto de inventario, falta el nivel de detalle.

## Escrituras que faltan

ATLAS hoy **no tiene ninguna ruta de escritura sobre equipos** (solo `POST /correo/prueba`) — todo
lo de acá está bloqueado en el hito M5 de ATLAS (a su vez bloqueado por falta de autenticación,
P-40, según [[Plataforma ATLAS (Codex)]]).

| Falta en ATLAS | Para qué la usaría ARGOS | Dónde vive el código hoy | Estado del lado de ARGOS |
|---|---|---|---|
| Crear/modificar una red WiFi (SSID → VLAN) | Aplicar un plan de VLAN ya aprobado por un humano | `remediation.logic.ts` vía `writeWifiNetwork` | Listo para conectar en cuanto exista la ruta — ya tiene lock distribuido, verificación post-escritura y rollback automático. No es un diseño a medio hacer, es la pieza que falta del otro lado. |
| Reiniciar un dispositivo por ID | Reboot manual confirmado por un técnico | `network.service.ts::rebootNode` | Listo para conectar — ya pasa por lock + auditoría. |
| Reiniciar un dispositivo por ID (mismo dato) | Reboot automático de auto-remediación | `autoRemediation.service.ts` | **Deliberadamente pausado hasta M5** — ver decisión abajo, no tocar mientras tanto. |
| Re-adoptar un dispositivo pendiente | Recuperación cuando el reset simple no alcanza | `autoRemediation.service.ts::intentarRecuperar` | Mismo pausado que el ítem anterior. |

## Decisión vigente (2026-08-11)

- El flujo de VLAN (fila 1 de escrituras) ya sigue el patrón *proponer → reservar → aplicar* con
  aprobación humana explícita — en cuanto ATLAS tenga la ruta de escritura correspondiente, es un
  cambio de una línea (apuntar `remediation.logic.ts` a `AtlasHttpClient` en vez de
  `getUnifiClient()`), no un rediseño.
- El reboot manual (fila 2) es igual de simple de migrar el día que exista la ruta.
- La auto-remediación (filas 3 y 4, `worker-autoremediate.ts`) **se deja exactamente como está,
  hablando directo a UniFi, hasta que ATLAS llegue a M5** — decisión explícita, no un olvido. No
  se le agrega ni se le saca nada mientras tanto. Ver [[project_atlas_prod_deploy]] (memoria del
  agente) para el detalle de esa conversación.

## Ver también

- [[Plataforma ATLAS (Codex)]] — la regla de oro, el estado de M2/M5, por qué ATLAS no tiene
  escrituras todavía.
- [[ARGOS Arquitectura y Entrega 2026-08-10]] — contrato completo de las 21 rutas que ATLAS sí
  expone hoy.
- [[Despliegue a Producción]] — estado del deploy técnico de ARGOS, independiente de esto.
