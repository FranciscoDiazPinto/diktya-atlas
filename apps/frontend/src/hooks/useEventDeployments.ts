import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { ApiEventDeployment, ApiEventDeploymentDetail, EventReport } from "../types/api.js";

export function useEventDeployments(nombre?: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["events", nombre ?? null],
    queryFn: () => api.get<ApiEventDeployment[]>(`/events${nombre ? `?nombre=${encodeURIComponent(nombre)}` : ""}`),
  });
}

export function useEventDeployment(eventId: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["event", eventId ?? ""],
    queryFn: () => api.get<ApiEventDeploymentDetail>(`/events/${eventId}`),
    enabled: Boolean(eventId),
  });
}

export interface CreateEventDeploymentInput {
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
}

export function useCreateEventDeployment() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEventDeploymentInput) => api.post<ApiEventDeployment>("/events", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });
}

export function useEventReport(eventId: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["event-report", eventId ?? ""],
    queryFn: () => api.get<EventReport>(`/events/${eventId}/report`),
    enabled: false,
  });
}
