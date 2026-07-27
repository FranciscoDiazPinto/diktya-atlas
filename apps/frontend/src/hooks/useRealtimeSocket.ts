import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "../lib/apiClient.js";
import { queryKeys } from "../lib/queryKeys.js";

interface RealtimeEvent {
  type: "node_status_changed" | "alert" | "ticket_updated" | "vlan_reservation_updated";
  payload: unknown;
  timestamp: string;
}

function wsUrl(): string {
  return `${API_BASE_URL.replace(/^http/, "ws")}/ws`;
}

/**
 * Se monta una sola vez en App.tsx (no por vista) para no perder eventos
 * mientras el usuario está en otra tab. Invalida-y-refetch por tipo de
 * evento en vez de reconciliar el payload a mano en el cache — para el
 * volumen de esta app no vale la pena la complejidad extra de merge manual.
 */
export function useRealtimeSocket() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const retryDelayRef = useRef(1000);

  useEffect(() => {
    let socket: WebSocket | undefined;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    function connect() {
      socket = new WebSocket(wsUrl());

      socket.onopen = () => {
        retryDelayRef.current = 1000;
        setConnected(true);
      };

      socket.onmessage = (event) => {
        let parsed: RealtimeEvent;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        setLastEventAt(new Date());

        switch (parsed.type) {
          case "node_status_changed":
          case "alert":
            queryClient.invalidateQueries({ queryKey: queryKeys.networkStatus() });
            queryClient.invalidateQueries({ queryKey: ["network-node"] });
            break;
          case "ticket_updated":
            queryClient.invalidateQueries({ queryKey: ["tickets"] });
            queryClient.invalidateQueries({ queryKey: ["ticket"] });
            break;
          case "vlan_reservation_updated":
            // Sin vista dedicada a reservas todavía; punto de extensión.
            break;
        }
      };

      socket.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        retryTimeout = setTimeout(connect, retryDelayRef.current);
        retryDelayRef.current = Math.min(retryDelayRef.current * 2, 15_000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      socket?.close();
    };
  }, [queryClient]);

  return { connected, lastEventAt };
}
