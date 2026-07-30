---
tags: [atlas, indice]
updated: 2026-07-30
---

# Índice — bóveda Atlas

Mapa liviano de esta bóveda. Léase esta nota primero para decidir qué otra nota abrir — no hace
falta leer todo el vault para tener contexto.

## Software (NetBot)

- [[Proyecto Atlas]] — stack, arquitectura de seguridad, vistas del frontend, pendientes
  conocidos. Punto de entrada para todo lo del software.
- [[LLM y tools]] — orquestador de chat, loop multi-paso, memoria conversacional, tools.
- [[Mapeo de planos y cobertura]] — módulo de planos/AP/cobertura, modelo de datos, flujo.
- [[OPNsense y UniFi]] — panel `/infra`, qué es mock y qué es real hoy.
- [[Roles y permisos]] — matriz de roles, dónde se aplica el filtro, auth.
- [[Detección de stands por vision]] — diseño futuro, no implementado (doc completo en el repo).

## Infraestructura real (separada del software)

- [[Infraestructura Real]] — componentes core (OPNsense, UniFi, Proxmox, MikroTik Chateau),
  reglas de "no tocar", gobernanza, estado actual de bloqueos.
- [[Rutas de Red]] — tabla completa de rutas (ZeroTier, WireGuard, OPNsense, Proxmox) y el camino
  de facto (no el diseñado) para llegar a UniFi real hoy.
- [[Plataforma ATLAS (Codex)]] — sistema aparte, ya operativo, construido por Codex sobre la misma
  infraestructura real. No confundir con NetBot — leer antes de asumir que algo de
  observabilidad/alertas/auto-remediación ya está resuelto.

## Convención

- Una nota por tema, no un solo archivo gigante — así se puede leer solo lo relevante en vez de
  todo el vault.
- Rutas/IPs/topología sí se documentan acá. Credenciales, nunca — esas viven en
  `00_DATOS_PRIVADOS/` del otro repo de docs reales y no se copian a ningún lado.
- Fecha `updated:` en el frontmatter de cada nota — si está vieja, verificar contra el código o
  la infra real antes de confiar en ella a ciegas.
