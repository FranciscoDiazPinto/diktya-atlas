import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { generateTotpSecret, totpProvisioningUri, verifyTotpCode } from "../auth/totp.js";
import { signAccessToken, signPurposeToken, verifyPurposeToken, InvalidPurposeTokenError } from "../auth/tokens.js";
import {
  createSession,
  rotateSession,
  revokeSession,
  InvalidSessionError,
  SessionReuseDetectedError,
} from "../auth/session.service.js";
import { authenticate } from "../auth/middleware.js";
import { recordAudit } from "../services/audit.service.js";

const REFRESH_COOKIE_NAME = "refresh_token";
const REFRESH_COOKIE_PATH = "/auth";
const REFRESH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const LoginBodySchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const CodeBodySchema = z.object({ code: z.string().min(6).max(6) });

function toPublicUser(user: User) {
  return { id: user.id, email: user.email, role: user.role, totpEnabled: user.totpEnabled };
}

function getBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

async function issueSession(user: User, meta: { userAgent?: string; ipAddress?: string }) {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const { refreshToken } = await createSession(user.id, meta);
  return { accessToken, refreshToken };
}

function requestMeta(request: FastifyRequest) {
  return {
    userAgent: typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined,
    ipAddress: request.ip,
  };
}

export async function authRoutes(fastify: FastifyInstance) {
  // 2FA es obligatorio para ADMIN/TECNICO (pueden autorizar cambios de red);
  // VISUALIZADOR es solo lectura y no lo necesita.
  const ROLES_REQUIRING_2FA = new Set(["ADMIN", "TECNICO"]);

  fastify.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { email, password } = LoginBodySchema.parse(request.body);
      const user = await prisma.user.findUnique({ where: { email } });
      const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

      await recordAudit({
        actorId: user?.id,
        workerName: "auth",
        parametros: { accion: "login", email },
        resultado: { exitoso: passwordOk },
        exitoso: passwordOk,
      });

      if (!user || !passwordOk) {
        return reply.code(401).send({ error: "Credenciales inválidas" });
      }

      if (ROLES_REQUIRING_2FA.has(user.role) && !user.totpEnabled) {
        const setupToken = signPurposeToken({ sub: user.id, purpose: "2fa_setup" });
        return reply.send({ status: "2fa_setup_required", setupToken });
      }

      if (user.totpEnabled) {
        const loginToken = signPurposeToken({ sub: user.id, purpose: "2fa_login" });
        return reply.send({ status: "2fa_required", loginToken });
      }

      const { accessToken, refreshToken } = await issueSession(user, requestMeta(request));
      setRefreshCookie(reply, refreshToken);
      return reply.send({ status: "ok", accessToken, user: toPublicUser(user) });
    }
  );

  fastify.post("/auth/2fa/setup", async (request, reply) => {
    const token = getBearerToken(request);
    if (!token) return reply.code(401).send({ error: "Falta setupToken" });

    let payload;
    try {
      payload = verifyPurposeToken(token, "2fa_setup");
    } catch (err) {
      const status = err instanceof InvalidPurposeTokenError ? 400 : 401;
      return reply.code(status).send({ error: "setupToken inválido o expirado" });
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });

    return reply.send({ secret, otpauthUrl: totpProvisioningUri(user.email, secret) });
  });

  fastify.post("/auth/2fa/confirm", async (request, reply) => {
    const { code } = CodeBodySchema.parse(request.body);
    const token = getBearerToken(request);
    if (!token) return reply.code(401).send({ error: "Falta setupToken" });

    let payload;
    try {
      payload = verifyPurposeToken(token, "2fa_setup");
    } catch (err) {
      const status = err instanceof InvalidPurposeTokenError ? 400 : 401;
      return reply.code(status).send({ error: "setupToken inválido o expirado" });
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    if (!user.totpSecret) {
      return reply.code(400).send({ error: "No hay un setup de 2FA en curso para este usuario" });
    }

    const valid = verifyTotpCode(code, user.totpSecret);
    await recordAudit({
      actorId: user.id,
      workerName: "auth",
      parametros: { accion: "2fa_confirm" },
      resultado: { exitoso: valid },
      exitoso: valid,
    });
    if (!valid) return reply.code(401).send({ error: "Código inválido" });

    const confirmedUser = await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } });
    const { accessToken, refreshToken } = await issueSession(confirmedUser, requestMeta(request));
    setRefreshCookie(reply, refreshToken);
    return reply.send({ status: "ok", accessToken, user: toPublicUser(confirmedUser) });
  });

  fastify.post(
    "/auth/login/verify-totp",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { code } = CodeBodySchema.parse(request.body);
      const token = getBearerToken(request);
      if (!token) return reply.code(401).send({ error: "Falta loginToken" });

      let payload;
      try {
        payload = verifyPurposeToken(token, "2fa_login");
      } catch (err) {
        const status = err instanceof InvalidPurposeTokenError ? 400 : 401;
        return reply.code(status).send({ error: "loginToken inválido o expirado" });
      }

      const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
      const valid = user.totpSecret ? verifyTotpCode(code, user.totpSecret) : false;
      await recordAudit({
        actorId: user.id,
        workerName: "auth",
        parametros: { accion: "2fa_login" },
        resultado: { exitoso: valid },
        exitoso: valid,
      });
      if (!valid) return reply.code(401).send({ error: "Código inválido" });

      const { accessToken, refreshToken } = await issueSession(user, requestMeta(request));
      setRefreshCookie(reply, refreshToken);
      return reply.send({ status: "ok", accessToken, user: toPublicUser(user) });
    }
  );

  fastify.post("/auth/refresh", async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE_NAME];
    if (!raw) return reply.code(401).send({ error: "Sin sesión" });

    try {
      const { refreshToken, user } = await rotateSession(raw, requestMeta(request));
      setRefreshCookie(reply, refreshToken);
      const accessToken = signAccessToken({ sub: user.id, role: user.role });
      return reply.send({ status: "ok", accessToken, user: toPublicUser(user) });
    } catch (err) {
      clearRefreshCookie(reply);
      if (err instanceof SessionReuseDetectedError) {
        await recordAudit({
          actorId: err.userId,
          workerName: "auth",
          parametros: { accion: "refresh_reuse_detected" },
          resultado: { error: err.message },
          exitoso: false,
        });
      } else if (!(err instanceof InvalidSessionError)) {
        throw err;
      }
      return reply.code(401).send({ error: "Sesión inválida, iniciá sesión de nuevo" });
    }
  });

  fastify.post("/auth/logout", async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE_NAME];
    if (raw) await revokeSession(raw);
    clearRefreshCookie(reply);
    return reply.send({ status: "ok" });
  });

  fastify.get("/auth/me", { preHandler: authenticate }, async (request, reply) => {
    const ctx = request.authContext!;
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    return reply.send(toPublicUser(user));
  });
}
