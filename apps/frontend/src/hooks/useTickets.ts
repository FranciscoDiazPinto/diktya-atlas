import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys, type TicketFilters } from "../lib/queryKeys.js";
import type { ApiTicket } from "../types/api.js";

export function useTickets(filters: TicketFilters) {
  const api = useApiClient();
  const params = new URLSearchParams();
  if (filters.estado) params.set("estado", filters.estado);
  if (filters.severidad) params.set("severidad", filters.severidad);
  if (filters.nodoAfectadoId) params.set("nodoAfectadoId", filters.nodoAfectadoId);
  const qs = params.toString();

  return useQuery({
    queryKey: queryKeys.tickets(filters),
    queryFn: () => api.get<ApiTicket[]>(`/tickets${qs ? `?${qs}` : ""}`),
  });
}
