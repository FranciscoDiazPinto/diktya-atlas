import { useState } from "react";
import { Send, Trash2 } from "lucide-react";
import type { VlanPlan } from "@diktya-atlas/shared";
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
  const { user } = useAuth();
  const role = user!.role;
  const chat = useChat();
  const { messages, addMessage, clearMessages } = useChatMessages();
  const [input, setInput] = useState("");
  const [csvResult, setCsvResult] = useState<CsvUploadResponse | null>(null);
  const [plan, setPlan] = useState<VlanPlan | null>(null);

  function handleCsvResult(result: CsvUploadResponse) {
    setCsvResult(result);
    setPlan(result.plan);
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;

    const history = messages
      .filter((m) => !m.isError)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    addMessage({ id: crypto.randomUUID(), role: "user", content: text });
    setInput("");

    chat.mutate(
      { message: text, history },
      {
        onSuccess: (data) => {
          addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.mensaje,
            toolResults: data.toolResults,
          });
        },
        onError: (err) => {
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
        {messages.length > 0 && (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={clearMessages} title="Borrar conversación">
              <Trash2 className="h-3.5 w-3.5" /> Borrar conversación
            </Button>
          </div>
        )}
        <div className="flex min-h-[300px] flex-col gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
          {messages.length === 0 ? (
            <EmptyState
              title="Todavía no hay conversación"
              description="Escribí un mensaje o subí un CSV de redes/VLAN para empezar."
            />
          ) : (
            messages.map((m) => <ChatMessageCard key={m.id} message={m} />)
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
          <Button type="submit" disabled={chat.isPending || !input.trim()}>
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

        {plan && (
          <PlanDiffCard
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
