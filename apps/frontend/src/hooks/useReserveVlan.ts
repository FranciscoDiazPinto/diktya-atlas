import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { VlanReserveResponse } from "../types/api.js";

export function useReserveVlan() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (planId: string) => api.post<VlanReserveResponse>("/vlan/reserve", { planId }),
  });
}
