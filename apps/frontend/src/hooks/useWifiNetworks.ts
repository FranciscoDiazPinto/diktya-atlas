import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { LiveWifiNetwork } from "../types/api.js";

/**
 * A diferencia de useNetworkStatus (Postgres, refetch automático), esto
 * pega contra UniFi real — sin refetch automático, se actualiza bajo
 * demanda (mismo patrón que useUnifiOsStatus) para no generarle tráfico de
 * fondo al equipo real.
 */
export function useWifiNetworks(sitio?: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.wifiNetworks(sitio),
    queryFn: () =>
      api.get<LiveWifiNetwork[]>(`/network/wifi-networks/live${sitio ? `?sitio=${encodeURIComponent(sitio)}` : ""}`),
    enabled: false,
    retry: false,
  });
}
