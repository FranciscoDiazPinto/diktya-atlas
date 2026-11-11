export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface ApiClientOptions {
  accessToken: string | null;
  isSessionCurrent?: () => boolean;
  /** Ver auth/AuthContext.tsx::performRefresh — deduplicado, dispara el timer proactivo de nuevo. */
  refreshAccessToken: () => Promise<string>;
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function buildHeaders(opts: ApiClientOptions, extra?: Record<string, string>): HeadersInit {
  const headers: Record<string, string> = { ...extra };
  if (opts.accessToken) headers.authorization = `Bearer ${opts.accessToken}`;
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: { error?: string; detalles?: unknown } | undefined;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(res.status, body?.error ?? `Error ${res.status}`, body?.detalles);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Si el access token expiró (15 min, ver tokens.ts) la primera respuesta es
 * 401 — se pide uno nuevo (deduplicado, ver AuthContext.tsx::performRefresh)
 * y se reintenta la request UNA vez con el token fresco. Si el refresh mismo
 * falla (refresh token también vencido/revocado), se sigue con la respuesta
 * 401 original: performRefresh ya dejó la sesión en "unauthenticated", así
 * que el usuario cae al login en vez de quedar con la app congelada.
 */
async function requestWithRefresh<T>(url: string, init: RequestInit, opts: ApiClientOptions): Promise<T> {
  const assertCurrent = () => {
    if (opts.isSessionCurrent && !opts.isSessionCurrent()) throw new ApiError(409, "La sesión cambió");
  };
  assertCurrent();
  const res = await fetch(url, init);
  assertCurrent();
  if (res.status !== 401) {
    const data = await handleResponse<T>(res);
    assertCurrent();
    return data;
  }

  let freshToken: string;
  try {
    freshToken = await opts.refreshAccessToken();
  } catch {
    return handleResponse<T>(res);
  }

  assertCurrent();
  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("authorization", `Bearer ${freshToken}`);
  const retryRes = await fetch(url, { ...init, headers: retryHeaders });
  assertCurrent();
  const data = await handleResponse<T>(retryRes);
  assertCurrent();
  return data;
}

/**
 * Fábrica de cliente REST atado al access token actual (ver
 * auth/AuthContext.tsx). `credentials: "include"` en todos los fetch para
 * que la cookie httpOnly de refresh viaje — el access token va en
 * Authorization, nunca en cookie.
 */
export function createApiClient(opts: ApiClientOptions) {
  return {
    get: <T>(path: string): Promise<T> =>
      requestWithRefresh<T>(`${API_BASE_URL}${path}`, { headers: buildHeaders(opts), credentials: "include" }, opts),

    post: <T>(path: string, body?: unknown): Promise<T> =>
      requestWithRefresh<T>(
        `${API_BASE_URL}${path}`,
        {
          method: "POST",
          headers: buildHeaders(opts, body !== undefined ? { "content-type": "application/json" } : undefined),
          credentials: "include",
          body: body !== undefined ? JSON.stringify(body) : undefined,
        },
        opts
      ),

    postForm: <T>(path: string, form: FormData): Promise<T> =>
      requestWithRefresh<T>(
        `${API_BASE_URL}${path}`,
        { method: "POST", headers: buildHeaders(opts), credentials: "include", body: form },
        opts
      ),

    patch: <T>(path: string, body?: unknown): Promise<T> =>
      requestWithRefresh<T>(
        `${API_BASE_URL}${path}`,
        {
          method: "PATCH",
          headers: buildHeaders(opts, body !== undefined ? { "content-type": "application/json" } : undefined),
          credentials: "include",
          body: body !== undefined ? JSON.stringify(body) : undefined,
        },
        opts
      ),

    del: <T>(path: string): Promise<T> =>
      requestWithRefresh<T>(
        `${API_BASE_URL}${path}`,
        { method: "DELETE", headers: buildHeaders(opts), credentials: "include" },
        opts
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
