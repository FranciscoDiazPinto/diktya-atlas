import "dotenv/config";

/**
 * Los tests nunca deben poder tocar infraestructura real, sin importar lo
 * que diga el `.env` local del desarrollador en ese momento (ej. alguien
 * probando UNIFI_MODE=live a mano). Se fuerza acá, después de cargar
 * dotenv, para que ningún test dependa de recordar volver a poner mock
 * antes de correr la suite.
 */
process.env.UNIFI_MODE = "mock";
process.env.OPNSENSE_MODE = "mock";

/**
 * Postgres y Redis de test, aislados de los reales — encontrado el
 * 2026-07-31: varios tests (e2e-csv-to-apply, activityDigest, etc.) pegan
 * directo a `prisma`/BullMQ contra la BD real (DATABASE_URL/REDIS_URL del
 * .env del desarrollador), porque no había ninguna separación. Resultado:
 * cada corrida de `vitest run` insertaba tickets/audit logs de prueba que
 * contaminaban los reportes reales (`/reports/digest`) — confirmado y
 * limpiado a mano una vez, no debe volver a pasar.
 *
 * Reescribe DATABASE_URL para apuntar a `netbot_test` (mismo host/user/pass
 * que el real, swap solo del nombre de la base) y REDIS_URL al índice `/1`
 * (Redis separa por índice numérico, así las colas de BullMQ de test nunca
 * comparten keyspace con las reales en `/0`). La base `netbot_test` debe
 * existir y tener las migraciones aplicadas — ver
 * `pnpm --filter backend db:test:setup`.
 */
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/([^/?]+)(\?|$)/, "/netbot_test$2");
}
if (process.env.REDIS_URL) {
  process.env.REDIS_URL = process.env.REDIS_URL.replace(/\/\d+$/, "").replace(/\/?$/, "/1");
}
