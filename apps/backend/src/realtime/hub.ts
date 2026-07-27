import type { WebSocket } from "@fastify/websocket";
import { redis, createRedisConnection } from "../db/redis.js";

const CHANNEL = "realtime:events";

export interface RealtimeEvent {
  type: "node_status_changed" | "alert" | "ticket_updated" | "vlan_reservation_updated";
  payload: unknown;
  timestamp: string;
}

/**
 * Los workers corren como procesos Node separados del servidor HTTP (para
 * poder escalarlos/reiniciarlos de forma independiente), así que no pueden
 * tener una conexión WebSocket directa a los clientes del dashboard.
 * Publican a este canal de Redis; el proceso HTTP es el único que mantiene
 * conexiones WS y las reenvía (ver RealtimeHub más abajo).
 */
export async function publishRealtimeEvent(event: Omit<RealtimeEvent, "timestamp">): Promise<void> {
  const full: RealtimeEvent = { ...event, timestamp: new Date().toISOString() };
  await redis.publish(CHANNEL, JSON.stringify(full));
}

export class RealtimeHub {
  private clients = new Set<WebSocket>();
  private subscriber = createRedisConnection();

  constructor() {
    this.subscriber.subscribe(CHANNEL).catch((err: unknown) => {
      console.error("[realtime.hub] no se pudo suscribir a Redis", err);
    });
    this.subscriber.on("message", (_channel: string, message: string) => {
      this.broadcast(message);
    });
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on("close", () => this.clients.delete(ws));
  }

  private broadcast(raw: string): void {
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(raw);
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();
