#!/usr/bin/env bash
# Backup local de Postgres + uploads para ARGOS producción — ver DEPLOY.md §7.
# Corre pg_dump (vía el propio contenedor Postgres) y un tar del volumen de
# uploads (vía el contenedor backend, que ya lo tiene montado — evita tener
# que adivinar el nombre real del volumen, que depende del project name de
# Compose). Guarda ambos en $BACKUP_DIR con timestamp y rota lo más viejo
# que $RETENTION_DAYS. Copia fuera de esta máquina: todavía no implementada,
# ver nota al final de DEPLOY.md §7 — este script solo cubre "no perder todo
# si se corrompe el volumen o falla un contenedor", no un desastre del host.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

BACKUP_DIR="${BACKUP_DIR:-/opt/argos/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE="docker compose -f docker-compose.prod.yml"

# POSTGRES_USER/POSTGRES_DB los necesita este script (para el pg_dump);
# .env.production ya es la fuente de verdad para esos valores en todo el
# resto del deploy, así que se leen de ahí en vez de duplicarlos.
if [ ! -f .env.production ]; then
  echo "backup.sh: no existe .env.production en $REPO_ROOT — nada que respaldar" >&2
  exit 1
fi
POSTGRES_USER="$(grep -m1 '^POSTGRES_USER=' .env.production | cut -d= -f2-)"
POSTGRES_DB="$(grep -m1 '^POSTGRES_DB=' .env.production | cut -d= -f2-)"
if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_DB" ]; then
  echo "backup.sh: POSTGRES_USER/POSTGRES_DB no encontrados en .env.production" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

echo "backup.sh: dump de postgres ($POSTGRES_DB) -> $BACKUP_DIR/postgres-$TIMESTAMP.sql.gz"
$COMPOSE exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_DIR/postgres-$TIMESTAMP.sql.gz.tmp"
mv "$BACKUP_DIR/postgres-$TIMESTAMP.sql.gz.tmp" "$BACKUP_DIR/postgres-$TIMESTAMP.sql.gz"

echo "backup.sh: tar de uploads -> $BACKUP_DIR/uploads-$TIMESTAMP.tar.gz"
$COMPOSE exec -T backend tar czf - -C /app/apps/backend/uploads . > "$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz.tmp"
mv "$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz.tmp" "$BACKUP_DIR/uploads-$TIMESTAMP.tar.gz"

echo "backup.sh: rotando backups de más de $RETENTION_DAYS días en $BACKUP_DIR"
find "$BACKUP_DIR" -maxdepth 1 -name 'postgres-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'uploads-*.tar.gz' -mtime "+$RETENTION_DAYS" -delete

echo "backup.sh: ok"
