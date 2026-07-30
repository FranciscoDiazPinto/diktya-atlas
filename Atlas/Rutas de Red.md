---
tags: [atlas, infraestructura, redes, rutas]
updated: 2026-07-29
---

# Rutas de red documentadas

Todas las rutas de red documentadas para [[Infraestructura Real|la infraestructura real de
Diktya Atlas]], juntadas desde `~/Descargas/DIKTYA ATLAS/` para tener un panorama completo en un
solo lugar. Última verificación de reachability real: 2026-07-29 (misma tarde, dos hallazgos:
ver "Camino nuevo a UniFi" abajo — cambió durante el día).

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

### Camino nuevo a UniFi (2026-07-29) — port-forward en CORE-01, no ruta ZT

Confirmado en vivo: `https://10.71.111.101:8443` responde con headers inequívocos de un
controller UniFi real (`X-Csrf-Token`, `X-Updated-Csrf-Token`, nginx) — sobre la **misma IP ZT de
CORE-01** (`10.71.111.101`) pero puerto **8443** en vez del 443 de la GUI de OPNsense. No es una
ruta gestionada de ZeroTier (la tabla de arriba sigue sin tener `192.168.1.0/24`) — es
consistente con un **port-forward/NAT en CORE-01** hacia el controller interno, no con el diseño
documentado de WireGuard. No confirmado todavía quién lo configuró ni si es intencional o
temporal — no asumir que va a seguir estando disponible mañana sin volver a probar.

Esto significa que, mientras este port-forward siga activo, **no hace falta levantar WireGuard**
para llegar al UniFi real desde este equipo — alcanza con `https://10.71.111.101:8443` (ver
[[Infraestructura Real]] para el estado de acceso actualizado).

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

El camino *diseñado* para UniFi sigue siendo WireGuard (bloqueado por Starlink sin datos). Pero
hoy (2026-07-29) hay un camino *de facto* funcionando: `https://10.71.111.101:8443` vía
ZeroTier, aparentemente un port-forward en CORE-01 no documentado formalmente acá. Tratarlo como
algo a **confirmar con Lucas** antes de depender de él para nada operativo — no sabemos si es
intencional/permanente.

## Ver también

- [[Infraestructura Real]] — componentes core y reglas de gobernanza
- [[Proyecto Atlas]] — el software que eventualmente va a operar sobre esta red
