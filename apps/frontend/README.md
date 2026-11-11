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

## Privacidad del chat y cambios de sesión

El chat recupera conversaciones privadas desde el backend, permite crear,
seleccionar, recargar y borrar conversaciones, y cargar mensajes anteriores.
Ya no almacena ni reenvía historial desde `localStorage`; elimina la clave antigua
sin importarla. El backend debe tener aplicada la migración de conversaciones.

Al iniciar/cerrar sesión o cambiar la identidad/rol durante una renovación, se
limpia la caché de consultas y se desmontan las vistas privadas. El cliente REST
rechaza respuestas tardías de otra sesión y evita reintentarlas con credenciales
nuevas. El refresh y el enrolamiento 2FA también descartan respuestas anteriores.

Las pruebas cubren recuperación/borrado del chat, respuestas tardías, limpieza de
caché y refresh después de logout. En Node 26, ejecutar las pruebas con
`NODE_OPTIONS=--no-experimental-webstorage pnpm test` para que jsdom proporcione
`localStorage` en lugar de la implementación experimental de Node.


## Revisión y aprobación de red

El chat/CSV propone; la tarjeta permite reservar y abrir un diálogo para revisar
cada fila antes de confirmar. La solicitud incluye versión y huella del plan.
La interfaz distingue encolado de aplicado/verificado, consulta el estado del worker
mientras hay actividad, muestra errores y permite liberar reservas que aún no
escriben o que están bloqueadas. Una reserva incierta requiere revisión técnica.

El selector permite retomar las 20 propuestas propias más recientes tras recargar,
incluidas las creadas por herramientas del chat. Los planes duran 30 minutos y
las aprobaciones hasta 10 minutos. Los planes simulados se identifican expresamente.
Actualizar también backend y workers: los contratos antiguos de reserva/aplicación
sin versión/huella/confirmación ya no se aceptan.
