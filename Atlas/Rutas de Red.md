---
tags: [atlas, infraestructura, redes, rutas]
updated: 2026-07-29
---

# Rutas de red documentadas

Todas las rutas de red documentadas para [[Infraestructura Real|la infraestructura real de
Diktya Atlas]], juntadas desde `~/Descargas/DIKTYA ATLAS/` para tener un panorama completo en un
solo lugar. Última verificación de reachability real: 2026-07-29.

## ZeroTier (overlay `10.71.111.0/24`, red `76fc96e498382f09`)

Solo se usa para el **plano OOB de rescate** — no es el camino pensado para UniFi.
	
| Destino                  | Vía                             | Estado                                                            |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------- |
| `10.50.50.0/24`          | `10.71.111.11` (Chateau RACK-A) | ✅ Activa, validada por internet                                   |
| `10.50.60.0/24`          | `10.71.111.12` (Chateau RACK-B) | ⏸️ Reservada, sin uso — RACK-B aún no tiene su Chateau desplegado |
| `192.168.1.0/24` (UniFi) | —                               | ❌ No existe ni está planeada como ruta gestionada                 |

**Regla de diseño explícita**: una ruta gestionada por rack, nunca la misma ruta desde dos
routers.

**Antecedente puntual** (validación 2026-07-19, sesión V-03): alguien llegó al GUI de UniFi
*sobre* ZeroTier, pero fue una **ruta manual client-side** (`192.168.1.0/24 → 10.71.111.102`
como next-hop usando la IP ZT de CORE-02), no una ruta gestionada tipo las de arriba. No es un
mecanismo estándar ni permanente.

## WireGuard (`WG_USUARIOS`, wg0) — el camino diseñado para llegar a UniFi

| Rack | Servidor | Endpoint         | Puerto                                                                      |
| ---- | -------- | ---------------- | --------------------------------------------------------------------------- |
| A    | CORE-01  | `10.100.98.1/24` | 51820                                                                       |
| B    | CORE-02  | `10.100.99.1/24` | 51820 (expuesto vía DNAT en CORE-01, puerto externo 51821, `vpn.diktya.cl`) |

**AllowedIPs del cliente (split tunnel)**: `10.100.0.0/16, 192.168.1.0/24, 192.168.200.0/24` —
UniFi (`192.168.1.0/24`) está explícitamente incluido acá. Este es el único lugar donde el acceso
a UniFi está diseñado formalmente.

Puente entre cores (para que un túnel a cualquier rack alcance ambos cores):
- CORE-01 → `10.100.99.0/24` vía `10.100.20.252`
- CORE-02 → `10.100.98.0/24` vía `10.100.20.253`

RACK-B: como su gateway por defecto es el MikroTik y no CORE-01, hay un workaround de
source-NAT para el retorno asimétrico del DNAT (registrado 2026-07-07).

**Bloqueo actual**: el túnel no completa handshake porque Starlink (WAN_901) no tiene IP — ver
[[Infraestructura Real]].

## OPNsense — rutas estáticas

| Destino | Vía | Notas |
|---|---|---|
| `10.100.0.0/16` | `192.168.1.4` (VIP, vhid 240) | Ruta de rescate EFG — acá reaparece el equipo UniFi si se resetea. **No tocar sin confirmación + backup + dual-write** (VLAN 20 crítica). |

## Proxmox

| Destino | Vía | Notas |
|---|---|---|
| `10.100.25.0/24` | `10.100.15.254` (dev `vmbr0`) | En SMV-01/SMV-02, persistida vía `diktya-ruta.service`. VLAN15→VLAN25 (contenedores de monitoreo). |

## Conclusión práctica

No está prohibido llegar a UniFi por ZeroTier, pero el camino *diseñado* es WireGuard. En vez de
pedir una ruta ZT nueva para `192.168.1.0/24`, lo alineado con el diseño real es reintentar el
túnel WireGuard una vez que Starlink tenga datos de nuevo — ese es el bloqueo actual, no la
ausencia de una ruta ZT.

## Ver también

- [[Infraestructura Real]] — componentes core y reglas de gobernanza
- [[Proyecto Atlas]] — el software que eventualmente va a operar sobre esta red
