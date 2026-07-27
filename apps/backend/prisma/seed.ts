import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Usuarios de desarrollo con IDs fijos, para que el auth stub
 * (src/auth/context.ts) tenga siempre una FK válida sin necesitar login
 * real todavía. passwordHash es un placeholder — el prompt de seguridad
 * lo reemplaza por hashes argon2id reales.
 */
async function main() {
  const devUsers = [
    { id: "dev-admin", email: "admin@dev.local", role: "ADMIN" as const },
    { id: "dev-tecnico", email: "tecnico@dev.local", role: "TECNICO" as const },
    { id: "dev-visualizador", email: "visualizador@dev.local", role: "VISUALIZADOR" as const },
  ];

  for (const user of devUsers) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: { ...user, passwordHash: "dev-stub-no-usar-en-produccion" },
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
