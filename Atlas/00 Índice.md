---
tags: [atlas, indice]
updated: 2026-08-10
---

# Índice — bóveda Atlas

Mapa liviano de esta bóveda. Léase esta nota primero para decidir qué otra nota abrir — no hace
falta leer todo el vault para tener contexto.

> **Rename 2026-08-10: el software pasó a llamarse ARGOS** (antes "NetBot") — decisión de Lucas +
> el agente, formalizada en la entrega del 2026-08-10. Notas viejas todavía dicen "NetBot" en
> varios lugares; el código del repo también. Ver [[ARGOS Arquitectura y Entrega 2026-08-10]]
> primero si venís de una sesión anterior a esta fecha.

## Software (ARGOS, antes "NetBot")

- [[ARGOS Arquitectura y Entrega 2026-08-10]] — **empezar por acá**: el rename, la decisión de
  arquitectura (consume ATLAS, nunca sondea equipos), la VM ya entregada, el contrato de API.
- [[ATLAS — Rutas faltantes para ARGOS]] — lista concreta para Lucas: qué le falta a la API de
  ATLAS (lecturas de detalle + todas las escrituras) para que ARGOS deje de hablarle directo a
  UniFi. Decisión 2026-08-11: no se saltea la regla con workarounds, se documenta y se espera.
- [[Proyecto Atlas]] — stack, arquitectura de seguridad, vistas del frontend, pendientes
  conocidos. Punto de entrada para todo lo del software.
- [[LLM y tools]] — orquestador de chat, loop multi-paso, memoria conversacional, tools.
- [[Mapeo de planos y cobertura]] — módulo de planos/AP/cobertura, modelo de datos, flujo.
- [[OPNsense y UniFi]] — **superado**: describe sondeo directo a UniFi/OPNsense, arquitectura
  descartada el 2026-08-10. Queda como historial técnico, no como camino a seguir.
- [[Roles y permisos]] — matriz de roles, dónde se aplica el filtro, auth.
- [[Detección de stands por vision]] — diseño futuro, no implementado (doc completo en el repo).
- [[Despliegue a Producción]] — la VM real ya existe (ver arriba); artefactos Docker Compose +
  Caddy, pendiente adaptarlos a la VLAN 25 y a operar sin WAN.
- [[WhatsApp y credenciales de invitados]] — **en pausa**, esperando definición con Lucas: soporte
  a clientes por WhatsApp + entrega de vouchers de red, bloqueado en una decisión de gobernanza de
  la API clásica de UniFi.

## Infraestructura real (separada del software)

- [[Infraestructura Real]] — componentes core (OPNsense, UniFi, Proxmox, MikroTik Chateau),
  reglas de "no tocar", gobernanza, estado actual de bloqueos.
- [[Rutas de Red]] — tabla completa de rutas (ZeroTier, WireGuard, OPNsense, Proxmox) y el camino
  de facto (no el diseñado) para llegar a UniFi real hoy.
- [[Plataforma ATLAS (Codex)]] — sistema que ARGOS consume (ya no "aparte" — ver decisión del
  2026-08-10). Leer antes de asumir que algo de observabilidad/alertas/auto-remediación se
  resuelve sondeando directo.

## Convención

- Una nota por tema, no un solo archivo gigante — así se puede leer solo lo relevante en vez de
  todo el vault.
- Rutas/IPs/topología sí se documentan acá. Credenciales, nunca — esas viven en
  `00_DATOS_PRIVADOS/` del otro repo de docs reales y no se copian a ningún lado.
- Fecha `updated:` en el frontmatter de cada nota — si está vieja, verificar contra el código o
  la infra real antes de confiar en ella a ciegas.
