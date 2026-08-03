import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { ApiMobilityStatus } from "../types/api.js";

/**
 * Igual que useUnifiOsStatus: pega contra una API cloud real (api.ui.com),
 * sin refetch automático — bajo demanda, para no generarle tráfico de
 * fondo a una API externa cada 30s.
 */
export function useMobilityStatus() {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.mobilityStatus(),
    queryFn: () => api.get<ApiMobilityStatus>("/mobility/status"),
    enabled: false,
    retry: false,
  });
}
