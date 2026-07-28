import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { ApiEventZone, ApiEventZoneDetail } from "../types/api.js";

export function useEventZones(eventId: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["event-zones", eventId ?? ""],
    queryFn: () => api.get<ApiEventZone[]>(`/events/${eventId}/zones`),
    enabled: Boolean(eventId),
  });
}

export function useEventZone(eventId: string | undefined, zoneId: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["event-zone", eventId ?? "", zoneId ?? ""],
    queryFn: () => api.get<ApiEventZoneDetail>(`/events/${eventId}/zones/${zoneId}`),
    enabled: Boolean(eventId) && Boolean(zoneId),
  });
}

export interface CreateEventZoneInput {
  eventId: string;
  venueId: string;
  nombreZona: string;
  /** Override opcional del plano del Venue (ej. ya anotado para esta zona puntual). */
  file?: File;
}

export function useCreateEventZone() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, venueId, nombreZona, file }: CreateEventZoneInput) => {
      const form = new FormData();
      form.append("venueId", venueId);
      form.append("nombreZona", nombreZona);
      if (file) form.append("file", file);
      return api.postForm<ApiEventZone>(`/events/${eventId}/zones`, form);
    },
    onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: ["event-zones", variables.eventId] }),
  });
}

export interface CalibratePoint {
  x: number;
  y: number;
}

export function useCalibrateZone() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      zoneId,
      p1,
      p2,
      distanciaMetros,
    }: {
      eventId: string;
      zoneId: string;
      p1: CalibratePoint;
      p2: CalibratePoint;
      distanciaMetros: number;
    }) => api.post<ApiEventZone>(`/events/${eventId}/zones/${zoneId}/calibrate`, { p1, p2, distanciaMetros }),
    onSuccess: (_data, variables) =>
      queryClient.invalidateQueries({ queryKey: ["event-zone", variables.eventId, variables.zoneId] }),
  });
}
