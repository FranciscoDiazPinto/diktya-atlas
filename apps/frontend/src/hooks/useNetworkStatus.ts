import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { NetworkStatusSummary } from "../types/api.js";

export function useNetworkStatus(sitio?: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.networkStatus(sitio),
    queryFn: () =>
      api.get<NetworkStatusSummary>(`/network/status${sitio ? `?sitio=${encodeURIComponent(sitio)}` : ""}`),
    refetchInterval: 30_000,
  });
}
