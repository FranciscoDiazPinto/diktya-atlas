import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { API_BASE_URL } from "../lib/apiClient.js";

/**
 * `/uploads/*` (planos) exige sesión igual que el resto de la API, así que
 * un <img src="..."> plano no sirve (el navegador no manda el Bearer en
 * ese request). Se trae el archivo con fetch autenticado y se expone como
 * blob: URL — se revoca sola al desmontar o cambiar de archivo.
 */
export function useAuthenticatedFileUrl(path: string | null): {
  url: string | null;
  loading: boolean;
  error: Error | null;
} {
  const { accessToken } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_BASE_URL}${path}`, {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined,
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) throw new Error(`No se pudo cargar el plano (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, accessToken]);

  return { url, loading, error };
}
