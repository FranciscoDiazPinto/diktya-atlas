import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import { queryKeys } from "../lib/queryKeys.js";
import type { ApiTicket } from "../types/api.js";

export function useResolveTicket() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, action }: { ticketId: string; action: "resolve" | "reopen" }) =>
      api.post<ApiTicket>(`/tickets/${ticketId}/${action}`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketDetail(variables.ticketId) });
    },
  });
}
