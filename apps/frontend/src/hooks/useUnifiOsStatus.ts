import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { UnifiOsStatus } from "../types/api.js";

/**
 * A diferencia de useOpnsenseStatus (mock, refetch automático cada 30s),
 * esto pega contra hardware real — sin refetch automático, se actualiza
 * bajo demanda para no generarle tráfico de fondo al equipo real.
 */
export function useUnifiOsStatus() {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.unifiOsStatus(),
    queryFn: () => api.get<UnifiOsStatus>("/unifi-os/status"),
    enabled: false,
    retry: false,
  });
}
