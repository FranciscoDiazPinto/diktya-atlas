import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Crea (si falta) y migra/siembra la base de datos de test (`netbot_test`),
 * separada de la real — ver el comentario en test/setup.ts sobre por qué:
 * antes del 2026-07-31, correr `vitest run` insertaba datos de prueba en
 * la misma base que usa el dashboard/reportes reales.
 *
 * Idempotente: correrlo de nuevo no rompe nada, solo confirma que la base
 * de test existe y está al día con las migraciones + los 3 usuarios dev
 * que varios tests asumen (dev-admin/dev-tecnico/dev-visualizador).
 */
function deriveTestUrl(realUrl: string): string {
  return realUrl.replace(/\/([^/?]+)(\?|$)/, "/netbot_test$2");
}

async function main() {
  const realUrl = process.env.DATABASE_URL;
  if (!realUrl) throw new Error("Falta DATABASE_URL en el entorno (cargar .env primero)");
  const testUrl = deriveTestUrl(realUrl);
  const maintenanceUrl = realUrl.replace(/\/([^/?]+)(\?|$)/, "/postgres$2");

  const maintenanceClient = new PrismaClient({ datasources: { db: { url: maintenanceUrl } } });
  try {
    await maintenanceClient.$executeRawUnsafe(`CREATE DATABASE netbot_test`);
    console.log("netbot_test creada.");
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      console.log("netbot_test ya existía, sigo.");
    } else {
      throw err;
    }
  } finally {
    await maintenanceClient.$disconnect();
  }

  console.log("Aplicando migraciones...");
  execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });

  console.log("Sembrando usuarios dev...");
  execFileSync("npx", ["tsx", "prisma/seed.ts"], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });

  console.log("netbot_test lista.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
