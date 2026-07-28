import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { OpnsenseStatusSummary } from "../types/api.js";

export function useOpnsenseStatus() {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.opnsenseStatus(),
    queryFn: () => api.get<OpnsenseStatusSummary>("/opnsense/status"),
    refetchInterval: 30_000,
  });
}
