# frontend (placeholder)

Todavía no implementado. Corresponde al **Prompt 2 (Frontend)** del spec de
NetBot: React + TypeScript + Vite, TailwindCSS + shadcn/ui, TanStack Query,
WebSocket contra `apps/backend` (`GET /ws`), consumiendo los tipos
compartidos en `packages/shared`.

El backend ya expone los contratos que este frontend va a consumir:
- REST: `POST /csv/upload`, `POST /vlan/reserve`, `POST /vlan/apply`,
  `GET /network/status`, `GET /network/nodes/:id`, `GET /tickets`,
  `POST /chat`.
- Realtime: `GET /ws` (eventos `node_status_changed`, `alert`,
  `ticket_updated`, `vlan_reservation_updated`, definidos en
  `apps/backend/src/realtime/hub.ts`).
- Tipos/schemas compartidos: `@diktya-atlas/shared` (roles, modelo de red,
  tickets, VLAN, tools del LLM).
