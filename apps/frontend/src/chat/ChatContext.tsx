import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ChatMessage } from "../components/chat/ChatMessageCard.js";

const STORAGE_KEY = "atlas-chat-messages";
/** Tope de mensajes retenidos — evita que localStorage crezca sin límite en sesiones largas. */
const MAX_STORED_MESSAGES = 100;

interface ChatContextValue {
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function loadStoredMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

/**
 * Vive por encima de las rutas (ver App.tsx) para que el historial del chat
 * sobreviva tanto a cambios de vista (Chat -> Red -> Chat) como a un
 * refresh de página (persistido en localStorage).
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  function addMessage(message: ChatMessage) {
    setMessages((prev) => [...prev, message].slice(-MAX_STORED_MESSAGES));
  }

  function clearMessages() {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  return <ChatContext.Provider value={{ messages, addMessage, clearMessages }}>{children}</ChatContext.Provider>;
}

export function useChatMessages(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatMessages debe usarse dentro de <ChatProvider>");
  return ctx;
}
