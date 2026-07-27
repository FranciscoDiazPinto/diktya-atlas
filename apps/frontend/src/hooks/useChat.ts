import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { ChatResponse } from "../types/api.js";

export function useChat() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (message: string) => api.post<ChatResponse>("/chat", { message }),
  });
}
