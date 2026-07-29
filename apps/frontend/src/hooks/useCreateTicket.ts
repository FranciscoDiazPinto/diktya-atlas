import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { ApiTicket, ApiAlertSeverity } from "../types/api.js";

export interface CreateTicketInput {
  titulo: string;
  descripcion: string;
  severidad: ApiAlertSeverity;
  nodoAfectadoId?: string;
  eventDeploymentId?: string;
}

export function useCreateTicket() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => api.post<ApiTicket>("/tickets", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
