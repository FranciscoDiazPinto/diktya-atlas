# Diktya Atlas — NetBot

Agente conversacional que automatiza la gestión de redes (UniFi + OPNsense, con
integración a Proxmox para usuarios) orquestado por un LLM externo.

Monorepo (pnpm workspaces):

- `apps/backend` — Fastify + Prisma/Postgres + BullMQ/Redis. Ver
  `apps/backend/README.md` para cómo levantarlo. **Implementado.**
- `apps/frontend` — React/Vite. Placeholder, corresponde al Prompt 2 del spec.
- `packages/shared` — tipos y schemas Zod compartidos (roles, modelo de red,
  tickets, VLAN, tools del LLM) entre backend y frontend.

Seguridad/auth reales (JWT, 2FA, roles a nivel de despliegue) corresponden al
Prompt 3 del spec — el backend ya deja el modelo de roles y los puntos de
extensión listos, pero usa un stub de auth por header mientras tanto (ver
`apps/backend/README.md`).
