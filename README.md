# Diktya Atlas — NetBot

[![GitHub Repo](https://img.shields.io/badge/GitHub-diktya--atlas-181717?logo=github&logoColor=white)](https://github.com/FranciscoDiazPinto/diktya-atlas)

Agente conversacional que automatiza la gestión de redes (UniFi + OPNsense, con
integración a Proxmox para usuarios) orquestado por un LLM externo.

Los 3 prompts del spec original (backend, frontend, seguridad) están
implementados. Monorepo (pnpm workspaces):

- `apps/backend` — Fastify + Prisma/Postgres + BullMQ/Redis + auth real
  (JWT/refresh/2FA). Ver `apps/backend/README.md`.
- `apps/frontend` — React/Vite, login real contra el backend. Ver
  `apps/frontend/README.md`.
- `packages/shared` — tipos y schemas Zod compartidos (roles, modelo de red,
  tickets, VLAN, tools del LLM) entre backend y frontend.
- [`SECURITY.md`](./SECURITY.md) — matriz de permisos, estrategia de
  despliegue (VPN de malla / túnel), y checklist de secretos/auditoría antes
  de producción.

Pendientes explícitos (documentados donde corresponde, no silenciados):
gestión de usuarios/roles desde Admin, cliente OPNsense real, auth del
WebSocket de tiempo real, y QR real para el enrolamiento de 2FA.
