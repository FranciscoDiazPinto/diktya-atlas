import type { AlertSeverity } from "@diktya-atlas/shared";
import { env } from "../config/env.js";

export interface NotificationMessage {
  mensaje: string;
  severidad: AlertSeverity;
  sitio?: string;
}

/**
 * El "grupo de técnicos" es, en esta primera pasada, cualquier canal
 * configurado por env var (todos reciben todo). Filtrar por rol/turno
 * específico es trabajo futuro — requiere el modelo de turnos que todavía
 * no existe; se deja el punto de extensión (`channel.send`) listo.
 */
export interface NotificationChannel {
  name: string;
  send(message: NotificationMessage): Promise<void>;
}

export class TelegramChannel implements NotificationChannel {
  name = "telegram";
  constructor(private botToken: string, private chatId: string) {}

  async send(message: NotificationMessage): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: `[${message.severidad}] ${message.sitio ? `(${message.sitio}) ` : ""}${message.mensaje}`,
      }),
    });
    if (!res.ok) throw new Error(`Telegram notify falló: ${res.status}`);
  }
}

export class SlackChannel implements NotificationChannel {
  name = "slack";
  constructor(private webhookUrl: string) {}

  async send(message: NotificationMessage): Promise<void> {
    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `*[${message.severidad}]* ${message.sitio ? `(${message.sitio}) ` : ""}${message.mensaje}`,
      }),
    });
    if (!res.ok) throw new Error(`Slack notify falló: ${res.status}`);
  }
}

export class WebhookChannel implements NotificationChannel {
  name = "webhook";
  constructor(private url: string) {}

  async send(message: NotificationMessage): Promise<void> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!res.ok) throw new Error(`Webhook notify falló: ${res.status}`);
  }
}

/** Placeholder: requiere un proveedor SMTP/API de email real para implementarse. */
export class EmailChannelStub implements NotificationChannel {
  name = "email";
  async send(message: NotificationMessage): Promise<void> {
    console.warn("[notification.service] EmailChannel no implementado todavía, mensaje descartado:", message);
  }
}

function buildChannelsFromEnv(): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (env.TELEGRAM_BOT_TOKEN) {
    // El chat_id del grupo de técnicos también debería venir de config;
    // se deja como parte del token compuesto hasta tener modelo de turnos.
    channels.push(new TelegramChannel(env.TELEGRAM_BOT_TOKEN, "TECH_GROUP_CHAT_ID"));
  }
  if (env.SLACK_WEBHOOK_URL) channels.push(new SlackChannel(env.SLACK_WEBHOOK_URL));
  if (env.GENERIC_WEBHOOK_URL) channels.push(new WebhookChannel(env.GENERIC_WEBHOOK_URL));
  if (env.EMAIL_SMTP_URL) channels.push(new EmailChannelStub());
  return channels;
}

let cachedChannels: NotificationChannel[] | undefined;

export async function notifyTechnicians(message: NotificationMessage): Promise<void> {
  const channels = cachedChannels ?? (cachedChannels = buildChannelsFromEnv());
  if (channels.length === 0) {
    console.warn("[notification.service] Sin canales de notificación configurados:", message);
    return;
  }
  const results = await Promise.allSettled(channels.map((c) => c.send(message)));
  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error(`[notification.service] Canal ${channels[i]!.name} falló`, result.reason);
    }
  }
}
