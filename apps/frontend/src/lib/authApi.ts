import { API_BASE_URL, ApiError } from "./apiClient.js";
import type { LoginResponse, Setup2faResponse, SessionResponse } from "../types/api.js";

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Error ${res.status}`, body?.detalles);
  }
  return body as T;
}

/**
 * Llamadas del flujo de auth: cada una manda un Bearer distinto según el
 * paso (ninguno para login, setupToken/loginToken de vida corta para los
 * pasos intermedios de 2FA) — por eso viven separadas del cliente REST
 * genérico (lib/apiClient.ts), que está atado a un solo access token.
 * `credentials: "include"` en todas para que la cookie de refresh viaje.
 */
export function login(email: string, password: string): Promise<LoginResponse> {
  return fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then((r) => parseJson<LoginResponse>(r));
}

export function setup2fa(setupToken: string): Promise<Setup2faResponse> {
  return fetch(`${API_BASE_URL}/auth/2fa/setup`, {
    method: "POST",
    credentials: "include",
    headers: { authorization: `Bearer ${setupToken}` },
  }).then((r) => parseJson<Setup2faResponse>(r));
}

export function confirm2fa(setupToken: string, code: string): Promise<SessionResponse> {
  return fetch(`${API_BASE_URL}/auth/2fa/confirm`, {
    method: "POST",
    credentials: "include",
    headers: { authorization: `Bearer ${setupToken}`, "content-type": "application/json" },
    body: JSON.stringify({ code }),
  }).then((r) => parseJson<SessionResponse>(r));
}

export function verifyLoginTotp(loginToken: string, code: string): Promise<SessionResponse> {
  return fetch(`${API_BASE_URL}/auth/login/verify-totp`, {
    method: "POST",
    credentials: "include",
    headers: { authorization: `Bearer ${loginToken}`, "content-type": "application/json" },
    body: JSON.stringify({ code }),
  }).then((r) => parseJson<SessionResponse>(r));
}

export function refresh(): Promise<SessionResponse> {
  return fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", credentials: "include" }).then((r) =>
    parseJson<SessionResponse>(r)
  );
}

export function logout(): Promise<{ status: "ok" }> {
  return fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", credentials: "include" }).then((r) =>
    parseJson<{ status: "ok" }>(r)
  );
}
