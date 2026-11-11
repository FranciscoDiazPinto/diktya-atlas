import type { VlanPlan } from "@diktya-atlas/shared";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { VlanReserveResponse } from "../types/api.js";

export function useReserveVlan() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (plan: VlanPlan) => api.post<VlanReserveResponse>("/vlan/reserve", { planId: plan.id, version: plan.version, fingerprint: plan.fingerprint }),
  });
}
