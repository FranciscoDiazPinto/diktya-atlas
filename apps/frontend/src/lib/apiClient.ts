export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface ApiClientOptions {
  accessToken: string | null;
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
 * Fábrica de cliente REST atado al access token actual (ver
 * auth/AuthContext.tsx). `credentials: "include"` en todos los fetch para
 * que la cookie httpOnly de refresh viaje — el access token va en
 * Authorization, nunca en cookie.
 */
export function createApiClient(opts: ApiClientOptions) {
  return {
    get: <T>(path: string): Promise<T> =>
      fetch(`${API_BASE_URL}${path}`, { headers: buildHeaders(opts), credentials: "include" }).then((r) =>
        handleResponse<T>(r)
      ),

    post: <T>(path: string, body?: unknown): Promise<T> =>
      fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: buildHeaders(opts, body !== undefined ? { "content-type": "application/json" } : undefined),
        credentials: "include",
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }).then((r) => handleResponse<T>(r)),

    postForm: <T>(path: string, form: FormData): Promise<T> =>
      fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: buildHeaders(opts),
        credentials: "include",
        body: form,
      }).then((r) => handleResponse<T>(r)),

    patch: <T>(path: string, body?: unknown): Promise<T> =>
      fetch(`${API_BASE_URL}${path}`, {
        method: "PATCH",
        headers: buildHeaders(opts, body !== undefined ? { "content-type": "application/json" } : undefined),
        credentials: "include",
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }).then((r) => handleResponse<T>(r)),

    del: <T>(path: string): Promise<T> =>
      fetch(`${API_BASE_URL}${path}`, {
        method: "DELETE",
        headers: buildHeaders(opts),
        credentials: "include",
      }).then((r) => handleResponse<T>(r)),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
