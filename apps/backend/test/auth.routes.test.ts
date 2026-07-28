import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { hashPassword } from "../src/auth/password.js";

const PASSWORD = "Test-Password-123!";

describe("auth routes (app.inject)", () => {
  let app: FastifyInstance;
  let visualizadorEmail: string;
  let tecnicoEmail: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    app = buildApp();
    await app.ready();

    visualizadorEmail = `visualizador-${randomUUID()}@example.com`;
    tecnicoEmail = `tecnico-${randomUUID()}@example.com`;
    const passwordHash = await hashPassword(PASSWORD);

    const visualizador = await prisma.user.create({
      data: { email: visualizadorEmail, passwordHash, role: "VISUALIZADOR" },
    });
    const tecnico = await prisma.user.create({
      data: { email: tecnicoEmail, passwordHash, role: "TECNICO" },
    });
    userIds.push(visualizador.id, tecnico.id);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  it("VISUALIZADOR loguea directo sin 2FA y recibe access token + cookie de refresh", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: visualizadorEmail, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.accessToken).toBeTruthy();
    expect(res.cookies.some((c) => c.name === "refresh_token")).toBe(true);
  });

  it("credenciales inválidas devuelven 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: visualizadorEmail, password: "incorrecta" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("TECNICO sin 2FA -> setup -> confirmar -> el siguiente login pide el código", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: tecnicoEmail, password: PASSWORD },
    });
    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json();
    expect(loginBody.status).toBe("2fa_setup_required");

    const setupRes = await app.inject({
      method: "POST",
      url: "/auth/2fa/setup",
      headers: { authorization: `Bearer ${loginBody.setupToken}` },
    });
    expect(setupRes.statusCode).toBe(200);
    const { secret } = setupRes.json();

    const confirmRes = await app.inject({
      method: "POST",
      url: "/auth/2fa/confirm",
      headers: { authorization: `Bearer ${loginBody.setupToken}` },
      payload: { code: authenticator.generate(secret) },
    });
    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().status).toBe("ok");

    const secondLoginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: tecnicoEmail, password: PASSWORD },
    });
    const secondLoginBody = secondLoginRes.json();
    expect(secondLoginBody.status).toBe("2fa_required");

    const verifyRes = await app.inject({
      method: "POST",
      url: "/auth/login/verify-totp",
      headers: { authorization: `Bearer ${secondLoginBody.loginToken}` },
      payload: { code: authenticator.generate(secret) },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().status).toBe("ok");
  });

  it("sin token, una ruta protegida responde 401", async () => {
    const res = await app.inject({ method: "GET", url: "/network/status" });
    expect(res.statusCode).toBe(401);
  });

  it("VISUALIZADOR autenticado no puede reservar VLAN (403) y queda auditado", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: visualizadorEmail, password: PASSWORD },
    });
    const { accessToken } = loginRes.json();

    const res = await app.inject({
      method: "POST",
      url: "/vlan/reserve",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { planId: "no-importa" },
    });
    expect(res.statusCode).toBe(403);

    const audit = await prisma.auditLog.findFirst({
      where: { workerName: "http-request", exitoso: false },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toBeTruthy();
  });

  it("refresh rota el token y detecta reuso", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: visualizadorEmail, password: PASSWORD },
    });
    const refreshCookie = loginRes.cookies.find((c) => c.name === "refresh_token")!;

    const refreshRes = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: refreshCookie.value },
    });
    expect(refreshRes.statusCode).toBe(200);

    // Reusar el token original (ya rotado) debe detectarse como robo de sesión.
    const reuseRes = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: refreshCookie.value },
    });
    expect(reuseRes.statusCode).toBe(401);
  });
});
