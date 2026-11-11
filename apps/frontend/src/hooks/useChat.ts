import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { ChatResponse } from "../types/api.js";

export interface SendChatMessageInput {
  message: string;
  conversationId: string;
  version: number;
}

export function useChat() {
  const api = useApiClient();
  return useMutation({
    mutationFn: (input: SendChatMessageInput) => api.post<ChatResponse>("/chat", input),
  });
}
