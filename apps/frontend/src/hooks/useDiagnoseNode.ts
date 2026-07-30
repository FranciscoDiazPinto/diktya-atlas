import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { ApiNetworkNode } from "../types/api.js";

/** Diagnóstico bajo demanda: consulta UniFi ahora mismo en vez de esperar al próximo polling automático. */
export function useDiagnoseNode() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: string) => api.post<ApiNetworkNode>(`/network/nodes/${nodeId}/diagnose`),
    onSuccess: (_data, nodeId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.nodeDetail(nodeId) });
      queryClient.invalidateQueries({ queryKey: ["network-status"] });
    },
  });
}
