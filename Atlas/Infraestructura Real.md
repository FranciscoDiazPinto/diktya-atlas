---
tags: [atlas, infraestructura, diktya]
updated: 2026-07-29
---

# Infraestructura real de Diktya Atlas

Esto es la infraestructura física/operativa real que NetBot está pensado para operar como
"agente de terreno" — separado del software (ver [[Proyecto Atlas]]). Fuente: documentación en
`~/Descargas/DIKTYA ATLAS/` (no versionada en el repo, son datos operativos reales).

## Qué es

Operador de red para eventos móviles (expos, ferias). Activos **permanentes**:
- 3 WANs: Starlink (901), WAN BK (respaldo), 5G (902).
- Rack AA (fijo). Rack BB viaja solo para eventos grandes.

## Componentes core

| Componente | Rol | Dirección | Notas |
|---|---|---|---|
| CORE-01 | OPNsense, MASTER | `10.71.111.101` | SSH puerto **222**, no 22 |
| CORE-02 | OPNsense, BACKUP | `10.71.111.102` | Solo 7 componentes sincronizan automático con CORE-01 — el resto necesita dual-write manual |
| UniFi Controller | Gestión WiFi | `192.168.1.1` | Alcanzable **solo por WireGuard** (ver [[Rutas de Red]]) — no confundir con el router local de este equipo de desarrollo, que coincide en IP |
| SMV-01 / SMV-02 | Proxmox | `10.71.111.201` / `.202` | Independientes, **no clusterizados** |
| MikroTik Chateau | Camino OOB de rescate vía 5G | `10.71.111.11` | **"No lo toques"** — un error ahí deja el sitio incomunicado y sin forma de arreglarlo a distancia |

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

- Yo (Claude) opero de forma autónoma en desarrollo y documentación.
- "Codex" (GPT) es un auditor externo, siempre supervisado por Lucas.
- Eventos reales requieren un milestone de revisión de seguridad antes del "primer evento real".
- La fase de pruebas corre hasta septiembre (2026).

## Estado actual conocido (2026-07-29)

- **Starlink (WAN_901) sin datos** → sin IP asignada → el túnel WireGuard hacia CORE-01 no
  completa el handshake (confirmado vía API de OPNsense: `addr4: ""` en esa interfaz).
- **UniFi real no alcanzable** desde este equipo de desarrollo: ZeroTier no tiene ruta gestionada
  a `192.168.1.0/24`, y WireGuard depende de que Starlink tenga datos. El camino *diseñado* para
  llegar a UniFi es WireGuard (trae `192.168.1.0/24` en su `AllowedIPs`), no ZeroTier — ver
  [[Rutas de Red]] para el detalle completo.
- **OPNsense real sí es alcanzable** desde este equipo vía ZeroTier (ping OK a `10.71.111.101`),
  con una API key de solo lectura ya disponible — usada solo para diagnóstico puntual, nunca para
  escribir.

## Ver también

- [[Proyecto Atlas]] — el software (NetBot) que opera sobre esta infraestructura
- [[Rutas de Red]] — tabla completa de rutas documentadas (ZeroTier, WireGuard, OPNsense, Proxmox)
