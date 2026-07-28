import type { User } from "@prisma/client";
import { prisma } from "../db/client.js";
import { generateOpaqueToken, hashOpaqueToken } from "./tokens.js";

const REFRESH_TOKEN_TTL_DAYS = 30;

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

export class InvalidSessionError extends Error {}

export class SessionReuseDetectedError extends Error {
  constructor(public userId: string) {
    super("Refresh token reusado: posible robo de sesión, se revocaron todas las sesiones del usuario");
  }
}

export async function createSession(userId: string, meta: SessionMeta = {}): Promise<{ refreshToken: string }> {
  const refreshToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      refreshTokenHash: hashOpaqueToken(refreshToken),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
      expiresAt,
    },
  });

  return { refreshToken };
}

/**
 * Rotación con detección de reuso: cada refresh token sirve una sola vez.
 * Si llega uno que YA está revocado (ya fue rotado antes), es la señal
 * clásica de que alguien más tiene una copia del token — se revocan todas
 * las sesiones del usuario en vez de solo rechazar este intento.
 */
export async function rotateSession(
  rawRefreshToken: string,
  meta: SessionMeta = {}
): Promise<{ refreshToken: string; user: User }> {
  const tokenHash = hashOpaqueToken(rawRefreshToken);
  const session = await prisma.session.findUnique({
    where: { refreshTokenHash: tokenHash },
    include: { user: true },
  });

  if (!session) throw new InvalidSessionError("Refresh token desconocido");

  if (session.revokedAt) {
    await revokeAllSessionsForUser(session.userId);
    throw new SessionReuseDetectedError(session.userId);
  }

  if (session.expiresAt < new Date()) {
    throw new InvalidSessionError("Refresh token expirado");
  }

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  const next = await createSession(session.userId, meta);
  return { refreshToken: next.refreshToken, user: session.user };
}

export async function revokeSession(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashOpaqueToken(rawRefreshToken);
  await prisma.session.updateMany({
    where: { refreshTokenHash: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
