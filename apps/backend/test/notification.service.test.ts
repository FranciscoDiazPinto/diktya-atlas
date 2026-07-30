import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * `notifyTechnicians` cachea los canales a nivel de módulo (una sola vez,
 * ver notification.service.ts::cachedChannels) — cada test necesita su
 * propia instancia del módulo para variar env, así que se resetea el
 * registro de módulos y se reimporta dinámicamente en cada caso.
 */
async function loadServiceWithEnv(envOverrides: Record<string, string | undefined>) {
  vi.resetModules();
  vi.doMock("../src/config/env.js", () => ({
    env: {
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_CHAT_ID: undefined,
      SLACK_WEBHOOK_URL: undefined,
      GENERIC_WEBHOOK_URL: undefined,
      EMAIL_SMTP_URL: undefined,
      ...envOverrides,
    },
  }));
  return import("../src/services/notification.service.js");
}

describe("notification.service — canal Telegram", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.doUnmock("../src/config/env.js");
  });

  it("envía a la URL de Telegram con el chat_id real de env, no un placeholder", async () => {
    const { notifyTechnicians } = await loadServiceWithEnv({
      TELEGRAM_BOT_TOKEN: "bot-123",
      TELEGRAM_CHAT_ID: "-100987654321",
    });

    await notifyTechnicians({ mensaje: "AP caído", severidad: "CRITICO", sitio: "oficina" });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botbot-123/sendMessage");
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe("-100987654321");
    expect(body.text).toContain("AP caído");
  });

  it("no habilita el canal Telegram si falta TELEGRAM_CHAT_ID (aunque haya token)", async () => {
    const { notifyTechnicians } = await loadServiceWithEnv({ TELEGRAM_BOT_TOKEN: "bot-123" });

    await notifyTechnicians({ mensaje: "AP caído", severidad: "INFO" });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("no habilita el canal Telegram si falta TELEGRAM_BOT_TOKEN (aunque haya chat id)", async () => {
    const { notifyTechnicians } = await loadServiceWithEnv({ TELEGRAM_CHAT_ID: "-100987654321" });

    await notifyTechnicians({ mensaje: "AP caído", severidad: "INFO" });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});
