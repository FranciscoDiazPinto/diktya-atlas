# NetBot frontend

React + TypeScript + Vite + Tailwind. Consume el backend en `apps/backend`:
REST (`/csv/upload`, `/vlan/*`, `/network/*`, `/tickets/*`, `/chat`, `/auth/*`)
y tiempo real (`GET /ws`). Login real contra `/auth/*` (JWT + refresh
rotation + 2FA obligatorio para Admin/Técnico) — ver
[`SECURITY.md`](../../SECURITY.md) en la raíz para el detalle del modelo de auth.

## Arranque local

Con el backend ya corriendo (ver `apps/backend/README.md`):

```bash
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:3000 por defecto
pnpm dev                # levanta Vite en :5173
```

Login con cualquiera de los 3 usuarios sembrados por `prisma/seed.ts` del
backend (`admin@dev.local` / `tecnico@dev.local` / `visualizador@dev.local`,
password `NetBotDev123!`). Admin/Técnico piden configurar 2FA la primera vez
— el secret/URI se muestran en pantalla para cargarlos a mano en una app
authenticator (no hay QR todavía, ver "Fuera de alcance").

## Estructura

- `src/auth/AuthContext.tsx` — sesión (access token en memoria, refresh
  silencioso al montar vía cookie httpOnly), login/2FA/logout.
- `src/components/auth/LoginView.tsx` — pantalla de login + pasos de 2FA.
- `src/components/layout/AppShell.tsx` — 3 tabs persistentes (Chat/Red/Tickets),
  semáforo de salud global, menú de usuario.
- `src/components/{chat,network,tickets}/` — las 3 vistas.
- `src/components/ui/` — primitivas estilo shadcn (Radix + CVA), incluye
  `StatusDot`/`StatTile` con la paleta validada de la skill `dataviz`.
- `src/hooks/` — TanStack Query por dominio + `useRealtimeSocket`/`RealtimeProvider`
  (un solo WebSocket compartido, invalida queries por tipo de evento).

## Tests

```bash
pnpm test
```

Vitest + React Testing Library: `PlanDiffCard` (diff renderizado + gating
por rol) y los estados de carga/error/vacío de `NetworkView`.

## Fuera de alcance

QR real para enrolar 2FA (queda como texto/URI para cargar a mano),
gestión de usuarios/roles desde Admin, y vista de topología de red (solo
tabular por ahora).
