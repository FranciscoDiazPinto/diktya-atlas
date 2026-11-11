import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { VlanApplyResponse } from "../types/api.js";

export function useApplyVlan() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reservationId: string; version: number; fingerprint: string; confirm: true }) =>
      api.post<VlanApplyResponse>("/vlan/apply", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.networkStatus() });
    },
  });
}
