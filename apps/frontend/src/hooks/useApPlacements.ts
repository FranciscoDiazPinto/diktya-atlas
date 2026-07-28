import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApModel } from "@diktya-atlas/shared";
import { useApiClient } from "./useApiClient.js";
import type { ApiApPlacement } from "../types/api.js";

export interface PlaceApInput {
  eventId: string;
  zoneId: string;
  modelo: ApModel;
  x: number;
  y: number;
  radioMetros?: number;
  rackLabel?: string;
}

export function usePlaceAp() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, zoneId, ...body }: PlaceApInput) =>
      api.post<ApiApPlacement>(`/events/${eventId}/zones/${zoneId}/aps`, body),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ["event-zone", variables.eventId, variables.zoneId] }),
  });
}

export interface UpdateApInput {
  eventId: string;
  zoneId: string;
  apId: string;
  x?: number;
  y?: number;
  radioMetros?: number;
  rackLabel?: string;
}

export function useUpdateAp() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, zoneId, apId, ...patch }: UpdateApInput) =>
      api.patch<ApiApPlacement>(`/events/${eventId}/zones/${zoneId}/aps/${apId}`, patch),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ["event-zone", variables.eventId, variables.zoneId] }),
  });
}

export function useDeleteAp() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, zoneId, apId }: { eventId: string; zoneId: string; apId: string }) =>
      api.del<void>(`/events/${eventId}/zones/${zoneId}/aps/${apId}`),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ["event-zone", variables.eventId, variables.zoneId] }),
  });
}
