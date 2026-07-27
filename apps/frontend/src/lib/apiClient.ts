import type { Role } from "@diktya-atlas/shared";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export interface ApiClientOptions {
  role: Role;
  userId: string;
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
  return { "x-role": opts.role, "x-user-id": opts.userId, ...extra };
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
 * Fábrica de cliente REST atado al rol/usuario actual (ver
 * auth/AuthContext.tsx). Sin auth real todavía, el "login" es elegir un
 * rol en el selector — estos headers son lo único que el backend usa para
 * saber quién sos.
 */
export function createApiClient(opts: ApiClientOptions) {
  return {
    get: <T>(path: string): Promise<T> =>
      fetch(`${API_BASE_URL}${path}`, { headers: buildHeaders(opts) }).then((r) => handleResponse<T>(r)),

    post: <T>(path: string, body?: unknown): Promise<T> =>
      fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: buildHeaders(opts, { "content-type": "application/json" }),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }).then((r) => handleResponse<T>(r)),

    postForm: <T>(path: string, form: FormData): Promise<T> =>
      fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: buildHeaders(opts),
        body: form,
      }).then((r) => handleResponse<T>(r)),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
