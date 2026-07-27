import { createContext, useContext, type ReactNode } from "react";
import { useRealtimeSocket } from "./useRealtimeSocket.js";

interface RealtimeContextValue {
  connected: boolean;
  lastEventAt: Date | null;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * Abre el WebSocket una sola vez (en la raíz de la app) y lo comparte vía
 * contexto — así AppShell (semáforo del header) y las vistas que muestran
 * "actualizado hace Xs" no terminan abriendo cada una su propia conexión.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const value = useRealtimeSocket();
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime debe usarse dentro de <RealtimeProvider>");
  return ctx;
}
