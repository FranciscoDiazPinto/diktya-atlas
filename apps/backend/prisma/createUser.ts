import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { PrismaClient, type Role } from "@prisma/client";
import { hashPassword } from "../src/auth/password.js";

/**
 * No hay ruta ni UI para crear usuarios reales todavía (gestión de
 * usuarios/roles queda documentada como pendiente en README.md) — este
 * script cubre la necesidad inmediata de producción: crear cuentas reales
 * por CLI en vez de usar los usuarios *.dev.local del seed.
 *
 * Uso: tsx prisma/createUser.ts --email tecnico@diktya.cl --role TECNICO
 * (pide la contraseña por stdin, nunca como argumento — así no queda en el
 * historial de la shell ni en `ps`).
 *
 * ADMIN/TECNICO quedan con totpEnabled=false a propósito, igual que el seed
 * — el primer login los manda por el flujo real de setup de 2FA.
 */
const ROLES: Role[] = ["ADMIN", "TECNICO", "VISUALIZADOR"];

function parseArgs(argv: string[]): { email: string; role: Role } {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (flag && value) args.set(flag, value);
  }

  const email = args.get("email");
  const role = args.get("role");
  if (!email || !role) {
    throw new Error("Uso: tsx prisma/createUser.ts --email <email> --role <ADMIN|TECNICO|VISUALIZADOR>");
  }
  if (!ROLES.includes(role as Role)) {
    throw new Error(`Rol inválido "${role}" — debe ser uno de: ${ROLES.join(", ")}`);
  }
  return { email, role: role as Role };
}

async function promptPassword(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const password = await rl.question("Contraseña para la cuenta nueva: ");
  rl.close();
  if (password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }
  return password;
}

async function main() {
  const { email, role } = parseArgs(process.argv.slice(2));
  const password = await promptPassword();
  const prisma = new PrismaClient();

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error(`Ya existe un usuario con ese email (id: ${existing.id}) — este script no actualiza cuentas.`);
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { id: randomUUID(), email, role, passwordHash },
    });
    // eslint-disable-next-line no-console
    console.log(`Usuario creado: ${user.email} (${user.role}, id ${user.id}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
