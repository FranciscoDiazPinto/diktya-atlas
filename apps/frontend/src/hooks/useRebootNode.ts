import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";

/** Reinicio remoto de un AP — siempre disparado por click explícito del técnico, nunca automático. */
export function useRebootNode() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: string) => api.post<{ ok: boolean }>(`/network/nodes/${nodeId}/reboot`),
    onSuccess: (_data, nodeId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.nodeDetail(nodeId) });
      queryClient.invalidateQueries({ queryKey: ["network-status"] });
    },
  });
}
