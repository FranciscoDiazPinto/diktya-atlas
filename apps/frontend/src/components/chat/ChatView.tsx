import { useEffect, useRef, useState } from "react";
import { Send, Trash2 } from "lucide-react";
import { VlanPlanSchema, type VlanPlan } from "@diktya-atlas/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../../hooks/useApiClient.js";
import { useAuth } from "../../auth/AuthContext.js";
import { useChat } from "../../hooks/useChat.js";
import { useChatMessages } from "../../chat/ChatContext.js";
import { CsvUploadZone } from "./CsvUploadZone.js";
import { PlanDiffCard } from "./PlanDiffCard.js";
import { ChatMessageCard } from "./ChatMessageCard.js";
import { EmptyState } from "../common/EmptyState.js";
import { Button } from "../ui/Button.js";
import type { CsvUploadResponse } from "../../types/api.js";

export function ChatView() {
  const { user, isSessionCurrent } = useAuth();
  const role = user!.role;
  const chat = useChat();
  const api = useApiClient();
  const cache = useQueryClient();
  const savedPlans = useQuery({ queryKey: ["vlan-plans"], queryFn: () => api.get<VlanPlan[]>("/vlan/plans"), enabled: role !== "VISUALIZADOR" });
  const { messages, addMessage, clearMessages, conversations, conversation, loading, error, selectConversation, newConversation, loadOlder, completeTurn } = useChatMessages();
  const [input, setInput] = useState("");
  const [csvResult, setCsvResult] = useState<CsvUploadResponse | null>(null);
  const [plan, setPlan] = useState<VlanPlan | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // La ventana de mensajes tiene alto fijo + scroll propio (ver el div de
  // abajo) para que no siga creciendo la página entera a medida que crece
  // la conversación — así que hay que scrollear al último mensaje a mano
  // cada vez que se agrega uno, si no queda fuera de vista.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  function handleCsvResult(result: CsvUploadResponse) {
    setCsvResult(result);
    setPlan(result.plan);
    void cache.invalidateQueries({ queryKey: ["vlan-plans"] });
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;

    if (!conversation || loading || chat.isPending || conversation.pending) return;

    addMessage({ id: crypto.randomUUID(), role: "user", content: text });
    setInput("");

    chat.mutate(
      { message: text, conversationId: conversation.id, version: conversation.version },
      {
        onSuccess: (data) => {
          if (!isSessionCurrent()) return;
          completeTurn(data.version);
          const proposal = data.toolResults.find((result) => result.ok && result.tool === "propose_vlan_plan");
          const parsedPlan = VlanPlanSchema.safeParse(proposal?.output);
          if (parsedPlan.success) { setPlan(parsedPlan.data); void cache.invalidateQueries({ queryKey: ["vlan-plans"] }); }
          addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.mensaje,
            toolResults: data.toolResults,
          });
        },
        onError: (err) => {
          if (!isSessionCurrent()) return;
          addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Error: ${(err as Error).message}`,
            isError: true,
          });
        },
      }
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <select aria-label="Conversación" value={conversation?.id ?? ""}
            disabled={loading || chat.isPending} onChange={(e) => void selectConversation(e.target.value)}
            className="min-w-0 flex-1 rounded border p-2 dark:bg-slate-900">
            <option value="" disabled>Seleccionar conversación</option>
            {conversations.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
          </select>
          <Button disabled={loading || chat.isPending} onClick={() => void newConversation()}>Nueva conversación</Button>
        </div>
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">Cargando conversación…</p>}
        {conversation?.pending && <p role="status">Hay una respuesta pendiente. Recarga la conversación; si el servidor se reinició, crea una nueva.</p>}
        {conversation && <Button variant="ghost" disabled={loading || chat.isPending} onClick={() => void selectConversation(conversation.id)}>Recargar conversación</Button>}
        {conversation?.nextBefore != null && <Button disabled={loading || chat.isPending} onClick={() => void loadOlder()}>Cargar mensajes anteriores</Button>}

        {messages.length > 0 && (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" disabled={loading || chat.isPending} onClick={() => void clearMessages()} title="Borrar conversación">
              <Trash2 className="h-3.5 w-3.5" /> Borrar conversación
            </Button>
          </div>
        )}
        <div className="flex h-[60vh] min-h-[320px] max-h-[640px] flex-col gap-3 overflow-y-auto rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          {messages.length === 0 ? (
            <EmptyState
              title="Todavía no hay conversación"
              description="Escribí un mensaje o subí un CSV de redes/VLAN para empezar."
            />
          ) : (
            <>
              {messages.map((m) => (
                <ChatMessageCard key={m.id} message={m} />
              ))}
              <div ref={bottomRef} />
            </>
          )}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Preguntale algo a NetBot…"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <Button type="submit" disabled={loading || chat.isPending || !conversation || conversation.pending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        {role === "VISUALIZADOR" ? (
          <EmptyState
            title="Sin permisos para cargar CSV"
            description="Tu rol (Visualizador) solo puede consultar el estado de la red. Cambiá a Técnico o Admin para proponer cambios de VLAN."
          />
        ) : (
          <CsvUploadZone onResult={handleCsvResult} />
        )}

        {csvResult && (
          <div className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800">
            <p className="mb-1 font-medium text-slate-700 dark:text-slate-300">Filas del CSV</p>
            <ul className="flex flex-col gap-1">
              {csvResult.filas.map((f) => (
                <li key={f.fila} className={f.ok ? "text-status-good" : "text-status-critical"}>
                  Fila {f.fila}: {f.ok ? "OK" : f.errores.join("; ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {role !== "VISUALIZADOR" && <div className="space-y-2">
          <label htmlFor="saved-network-plan" className="text-sm">Retomar un plan de red</label>
          <select id="saved-network-plan" value={plan?.id ?? ""} className="w-full rounded border p-2 dark:bg-slate-900"
            onChange={(event) => { setCsvResult(null); setPlan(savedPlans.data?.find((row) => row.id === event.target.value) ?? null); }}>
            <option value="">Seleccionar propuesta guardada</option>
            {savedPlans.data?.map((row) => <option key={row.id} value={row.id}>{new Date(row.creadoEn).toLocaleString()} · {row.items.length} filas</option>)}
          </select>
          {savedPlans.error && <p role="alert">{savedPlans.error.message}</p>}
        </div>}
        {plan && (
          <PlanDiffCard
            key={plan.id}
            plan={plan}
            onDismiss={() => {
              setPlan(null);
              setCsvResult(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
