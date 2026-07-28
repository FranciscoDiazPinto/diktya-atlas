import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();

// Password de desarrollo, documentada en el README — nunca usar en
// producción. ADMIN/TECNICO quedan con totpEnabled=false a propósito: el
// primer login de esos roles ejercita el flujo real de setup de 2FA
// (ver POST /auth/login -> status "2fa_setup_required").
const DEV_PASSWORD = "NetBotDev123!";

async function main() {
  const passwordHash = await hashPassword(DEV_PASSWORD);

  const devUsers = [
    { id: "dev-admin", email: "admin@dev.local", role: "ADMIN" as const },
    { id: "dev-tecnico", email: "tecnico@dev.local", role: "TECNICO" as const },
    { id: "dev-visualizador", email: "visualizador@dev.local", role: "VISUALIZADOR" as const },
  ];

  for (const user of devUsers) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { passwordHash },
      create: { ...user, passwordHash },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
