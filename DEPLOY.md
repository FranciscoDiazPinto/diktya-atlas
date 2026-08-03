# Runbook de despliegue a producción — NetBot

Para cuando la máquina dedicada esté disponible. Ver `SECURITY.md` para la
estrategia/checklist completos; esto es la secuencia operativa concreta.

**Gate**: esto prepara la infraestructura técnica. Operar un evento real
sigue bloqueado por el milestone de revisión de seguridad documentado en
`Atlas/Infraestructura Real.md` — no confundir "deploy listo" con "listo
para el primer evento real".

## 1. Prerrequisitos en la máquina dedicada

- Linux con Docker + Compose v2 (el plugin `docker compose` o el binario
  standalone `docker-compose` — cualquiera de los dos sirve, este runbook
  usa `docker compose` pero son intercambiables).
- Cliente ZeroTier instalado (`curl -s https://install.zerotier.com | sudo bash`,
  o el paquete de la distro).

Todos los comandos de acá abajo asumen que se corren desde la raíz del
repo, con `.env.production` ya creado ahí (paso 3) — ningún comando necesita
`--env-file`, cada servicio de `docker-compose.prod.yml` lo lee solo vía
`env_file:`.

## 2. Unir la máquina a la red ZeroTier real

```
sudo zerotier-cli join 76fc96e498382f09
```

Después hay que **autorizar el nodo nuevo** desde ZeroTier Central
(quien administre la cuenta de Diktya) — sin eso queda unido pero sin
tráfico. Confirmar con `zerotier-cli listnetworks` que el status pasa a
`OK` y que asigna una IP `10.71.111.x/24`.

## 3. Clonar el repo y preparar el entorno

```
git clone <url-del-repo> netbot && cd netbot
cp .env.production.example .env.production
```

Completar `.env.production` (nunca se commitea — ya está en `.gitignore`):

- `JWT_SECRET`: `openssl rand -hex 32`
- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` y `DATABASE_URL`:
  credenciales nuevas, no las de `netbot`/`netbot` del compose de
  desarrollo — **las 4 tienen que coincidir** (`DATABASE_URL` no se arma
  sola a partir de las otras 3, es deliberado, ver comentario en el
  `.example`).
- `UNIFI_API_KEY`: copiar del `.env` de desarrollo actual (ya validado
  contra el UDM real) o emitir uno nuevo si se prefiere separar dev/prod.
- `OPENROUTER_API_KEY`: key de producción, de pago (ver `SECURITY.md` —
  el modelo free actual falló en tool-calls multi-argumento, no usar).
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`: copiar del `.env` actual si se
  reusa el mismo canal, o crear uno nuevo para producción.
- `NETBOT_DOMAIN`: el hostname real (ej. `netbot.diktya.cl`).
- `CF_API_TOKEN`: token de Cloudflare, permiso **Zone:DNS:Edit** sobre la
  zona `diktya.cl` únicamente (no la Global API Key) — Caddy lo usa para el
  desafío DNS-01, no necesita que el servidor sea alcanzable públicamente.

## 4. Levantar Postgres/Redis y migrar ANTES que el resto

```
docker compose -f docker-compose.prod.yml up -d --build postgres redis
docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy
```

`migrate deploy`, **no** `migrate dev` — aplica migraciones existentes sin
generar nada nuevo ni pedir confirmación interactiva.

**Por qué en este orden**: si `backend`/los workers arrancan antes de
migrar, la primera pasada de cada uno falla (`P2021`, tabla inexistente) —
no es grave, BullMQ los reintenta solo (el poll de `worker-monitor` es cada
30s) y quedan sanos en el siguiente ciclo, pero da un arranque con errores
en los logs sin necesidad. Confirmado en pruebas locales (2026-08-03).

## 5. Levantar el resto y crear los usuarios reales

```
docker compose -f docker-compose.prod.yml up -d --build
```

Con la base ya migrada, esto levanta `backend`, los 5 workers
(`worker-monitor`, `worker-triage`, `worker-remediation`,
`worker-ticket-followup`, `worker-autoremediate`), `frontend` y `caddy` sin
el arranque con errores del punto anterior. Ningún servicio interno publica
puerto salvo `caddy` (80/443) — confirmado en `docker-compose.prod.yml`.

Crear las cuentas reales del equipo (pide la contraseña por stdin, nunca
como argumento):

```
docker compose -f docker-compose.prod.yml \
  run --rm backend pnpm user:create --email admin@diktya.cl --role ADMIN
```

Repetir por cada persona/rol necesario. Los usuarios `*.dev.local` del seed
de desarrollo **no se crean acá** — este flujo los reemplaza.

## 6. Smoke test

- `docker compose -f docker-compose.prod.yml ps` — los 8 servicios en
  `Up` (o `Up (healthy)` para `postgres`).
- `curl -I https://<NETBOT_DOMAIN>/` — `200`, certificado válido (sin
  warning del navegador).
- Login real desde el frontend con una cuenta creada en el paso 5,
  completar el setup de 2FA (primer login de ADMIN/TECNICO).
- `curl https://<NETBOT_DOMAIN>/api/network/status` con el `accessToken` de
  esa sesión — debe reflejar los nodos reales.
- Confirmar que `worker-monitor` está escribiendo eventos: revisar
  `docker compose logs worker-monitor` o, pasados unos minutos,
  `GET /api/reports/availability` no debería seguir en "sin datos" para los
  nodos ya conocidos.
- Verificar que el bypass de dev está cerrado: pegarle a cualquier ruta con
  header `x-role: ADMIN` y sin `Authorization` — debe dar `401`.

## 7. Backups (mínimo antes de operar cualquier evento real)

`netbot_postgres_prod_data` es el volumen con todo el estado (usuarios,
tickets, auditoría, reservas de VLAN). Definir un cron de
`pg_dump`/`docker compose exec postgres pg_dump` a almacenamiento fuera de
la misma máquina antes del milestone de seguridad — no cubierto por este
runbook todavía, queda como pendiente explícito.
