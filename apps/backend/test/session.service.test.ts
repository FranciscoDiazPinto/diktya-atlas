import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db/client.js";
import { hashPassword } from "../src/auth/password.js";
import {
  createSession,
  rotateSession,
  InvalidSessionError,
  SessionReuseDetectedError,
} from "../src/auth/session.service.js";

describe("session.service", () => {
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `session-test-${randomUUID()}@example.com`,
        passwordHash: await hashPassword("whatever"),
        role: "TECNICO",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("crea una sesión y permite rotarla", async () => {
    const { refreshToken } = await createSession(userId);
    const rotated = await rotateSession(refreshToken);
    expect(rotated.user.id).toBe(userId);
    expect(rotated.refreshToken).not.toBe(refreshToken);
  });

  it("reusar un refresh token ya rotado revoca todas las sesiones del usuario", async () => {
    const { refreshToken } = await createSession(userId);
    await rotateSession(refreshToken); // primera rotación: válida

    await expect(rotateSession(refreshToken)).rejects.toBeInstanceOf(SessionReuseDetectedError);

    const activeSessions = await prisma.session.count({ where: { userId, revokedAt: null } });
    expect(activeSessions).toBe(0);
  });

  it("un refresh token desconocido lanza InvalidSessionError", async () => {
    await expect(rotateSession("token-que-no-existe")).rejects.toBeInstanceOf(InvalidSessionError);
  });
});
