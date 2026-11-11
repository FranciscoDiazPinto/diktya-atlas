import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMessage } from "../components/chat/ChatMessageCard.js";
import { useApiClient } from "../hooks/useApiClient.js";
import { useAuth } from "../auth/AuthContext.js";

interface Conversation { id: string; title: string; version: number }
interface ConversationDetail extends Conversation {
  messages: (ChatMessage & { sequence: number })[];
  pending: boolean;
  nextBefore: number | null;
}
interface ChatContextValue {
  messages: ChatMessage[];
  conversations: Conversation[];
  conversation: ConversationDetail | null;
  loading: boolean;
  error: string | null;
  selectConversation: (id: string) => Promise<void>;
  newConversation: () => Promise<void>;
  loadOlder: () => Promise<void>;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => Promise<void>;
  completeTurn: (version: number) => void;
}
const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const api = useApiClient();
  const { isSessionCurrent } = useAuth();
  const apiRef = useRef(api);
  apiRef.current = api;
  const selection = useRef(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function selectConversation(id: string) {
    const current = ++selection.current;
    setLoading(true);
    setError(null);
    setConversation(null);
    setMessages([]);
    try {
      const detail = await apiRef.current.get<ConversationDetail>(`/chat/conversations/${id}`);
      if (current !== selection.current || !isSessionCurrent()) return;
      setConversation(detail);
      setMessages(detail.messages);
    } catch (err) {
      if (current === selection.current && isSessionCurrent()) setError((err as Error).message);
    } finally {
      if (current === selection.current && isSessionCurrent()) setLoading(false);
    }
  }
  async function newConversation() {
    const current = ++selection.current;
    setLoading(true);
    setError(null);
    setConversation(null);
    setMessages([]);
    try {
      const created = await apiRef.current.post<Conversation>("/chat/conversations");
      if (current !== selection.current || !isSessionCurrent()) return;
      setConversations((rows) => [created, ...rows]);
      setConversation({ ...created, messages: [], pending: false, nextBefore: null });
    } catch (err) {
      if (current === selection.current && isSessionCurrent()) setError((err as Error).message);
    } finally {
      if (current === selection.current && isSessionCurrent()) setLoading(false);
    }
  }
  useEffect(() => {
    let alive = true;
    // El historial antiguo no tenía propietario verificable: se elimina sin importarlo.
    try { localStorage.removeItem("atlas-chat-messages"); } catch { /* Almacenamiento bloqueado. */ }
    void (async () => {
      try {
        const rows = await apiRef.current.get<Conversation[]>("/chat/conversations");
        if (!alive || !isSessionCurrent()) return;
        setConversations(rows);
        if (rows[0]) await selectConversation(rows[0].id);
        else setLoading(false);
      } catch (err) {
        if (alive && isSessionCurrent()) { setError((err as Error).message); setLoading(false); }
      }
    })();
    return () => { alive = false; selection.current++; };
  }, []);

  async function clearMessages() {
    if (!conversation) return;
    setLoading(true);
    try {
      await apiRef.current.del(`/chat/conversations/${conversation.id}`);
      if (!isSessionCurrent()) return;
      selection.current++;
      setConversations((rows) => rows.filter((row) => row.id !== conversation.id));
      setConversation(null);
      setMessages([]);
      setError(null);
    } catch (err) {
      if (isSessionCurrent()) setError((err as Error).message);
    } finally { if (isSessionCurrent()) setLoading(false); }
  }
  async function loadOlder() {
    if (!conversation || conversation.nextBefore === null) return;
    const current = selection.current;
    setLoading(true);
    try {
      const page = await apiRef.current.get<ConversationDetail>(`/chat/conversations/${conversation.id}?before=${conversation.nextBefore}`);
      if (current !== selection.current || !isSessionCurrent()) return;
      setMessages((rows) => [...page.messages, ...rows]);
      setConversation((prev) => prev ? { ...prev, nextBefore: page.nextBefore } : prev);
    } catch (err) {
      if (current === selection.current && isSessionCurrent()) setError((err as Error).message);
    } finally { if (current === selection.current && isSessionCurrent()) setLoading(false); }
  }
  function addMessage(message: ChatMessage) {
    if (isSessionCurrent()) setMessages((prev) => [...prev, message]);
  }
  function completeTurn(version: number) {
    if (!isSessionCurrent()) return;
    setConversation((prev) => prev ? { ...prev, version } : prev);
    const title = messages.find((message) => message.role === "user")?.content.slice(0, 100);
    setConversations((rows) => rows.map((row) => row.id === conversation?.id ? { ...row, version, title: title ?? row.title } : row));
  }
  return <ChatContext.Provider value={{ messages, conversations, conversation, loading, error,
    selectConversation, newConversation, loadOlder, addMessage, clearMessages, completeTurn }}>{children}</ChatContext.Provider>;
}
export function useChatMessages() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatMessages debe usarse dentro de <ChatProvider>");
  return ctx;
}
