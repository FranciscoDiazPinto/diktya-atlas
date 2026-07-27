import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { TicketDetail } from "../types/api.js";

export function useTicketDetail(ticketId: string | undefined) {
  const api = useApiClient();
  return useQuery({
    queryKey: queryKeys.ticketDetail(ticketId ?? ""),
    queryFn: () => api.get<TicketDetail>(`/tickets/${ticketId}`),
    enabled: Boolean(ticketId),
  });
}
