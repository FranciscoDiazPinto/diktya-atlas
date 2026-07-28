import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "./useApiClient.js";
import type { ChatResponse } from "../types/api.js";

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SendChatMessageInput {
  message: string;
  /** Turnos previos visibles (sin toolResults) para que el LLM tenga contexto de la conversación. */
  history: ChatHistoryTurn[];
}

export function useChat() {
  const api = useApiClient();
  return useMutation({
    mutationFn: ({ message, history }: SendChatMessageInput) => api.post<ChatResponse>("/chat", { message, history }),
  });
}
