import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { ApNodeDetail } from "../types/api.js";

export function useNodeDetail(nodeId: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.nodeDetail(nodeId ?? ""),
    queryFn: () => api.get<ApNodeDetail>(`/network/nodes/${nodeId}`),
    enabled: Boolean(nodeId),
  });
}
