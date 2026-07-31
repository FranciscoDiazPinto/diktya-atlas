import { z } from "zod";

/**
 * Carga y valida todas las variables de entorno una sola vez, al arrancar.
 * Fail-fast: si falta algo requerido, el proceso no debe ni intentar
 * levantar el servidor/worker con configuración a medias.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerido"),
  REDIS_URL: z.string().min(1, "REDIS_URL es requerido"),

  UNIFI_MODE: z.enum(["mock", "live"]).default("mock"),
  UNIFI_HOST: z.string().optional(),
  UNIFI_PORT: z.coerce.number().int().positive().optional(),
  UNIFI_USERNAME: z.string().optional(),
  UNIFI_PASSWORD: z.string().optional(),
  UNIFI_SITE: z.string().default("default"),
  UNIFI_VERIFY_TLS: z.coerce.boolean().default(true),
  // API de integraciones de un UniFi OS real (UDM/UDR/etc), separada del
  // UnifiClient clásico de arriba — ver integrations/unifiOs/. Solo
  // lectura: esta API no expone WLANs ni alarmas (404, no 403 — no es
  // permisos del key, la ruta no existe en esta versión de la API).
  UNIFI_OS_HOST: z.string().optional(), // ej. "10.71.111.101:8443"
  UNIFI_API_KEY: z.string().optional(),
  // Separado de UNIFI_VERIFY_TLS (que es para el UnifiClient clásico) —
  // el UDM real usado en pruebas tiene certificado self-signed, default
  // false a propósito para no romper por TLS al primer intento.
  UNIFI_OS_VERIFY_TLS: z.coerce.boolean().default(false),

  // Auto-remediación (ver services/autoRemediation.service.ts): qué tipos
  // de dispositivo puede auto-reiniciar/re-adoptar sin confirmación humana.
  // Política controlada por Admin (config, no rol de usuario — la acción la
  // dispara el sistema, no hay nadie autenticado en ese momento). Default
  // acotado a AP: reiniciar un switch/gateway sin confirmación corta todo
  // el sitio, demasiado riesgo para arrancar. Admin puede ampliarlo acá.
  AUTO_REMEDIATE_DEVICE_TYPES: z
    .string()
    .default("AP")
    .transform((s) => new Set(s.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean))),
  // Cooldown: no reintentar auto-remediación sobre el mismo dispositivo
  // antes de este tiempo, para no quedar reintentando en loop uno que está
  // flapping — escala directo a ticket para técnico en su lugar.
  AUTO_REMEDIATE_COOLDOWN_MINUTES: z.coerce.number().int().positive().default(30),
  // Cuánto esperar después de cada intento (reboot, luego re-adopción) antes
  // de releer el estado y decidir si funcionó.
  AUTO_REMEDIATE_WAIT_SECONDS: z.coerce.number().int().positive().default(90),
  // Si terminó bien (se recuperó solo o gracias al reset/re-adopción) pero
  // estuvo offline más de esto, notificar por Telegram igual — un corte de
  // 20 minutos que se auto-resolvió justo antes de que actuáramos no debe
  // quedar tan silencioso como uno de 90 segundos. Por debajo del umbral,
  // solo queda el ticket INFO (auditoría), sin notificación.
  AUTO_REMEDIATE_NOTIFY_THRESHOLD_MINUTES: z.coerce.number().int().positive().default(5),

  OPNSENSE_MODE: z.enum(["mock", "live"]).default("mock"),
  OPNSENSE_HOST: z.string().optional(),
  OPNSENSE_API_KEY: z.string().optional(),
  OPNSENSE_API_SECRET: z.string().optional(),

  PROXMOX_HOST: z.string().optional(),
  PROXMOX_SVC_ACCOUNT: z.string().optional(),
  PROXMOX_SVC_TOKEN: z.string().optional(),

  LLM_PROVIDER: z.enum(["openrouter", "anthropic", "openai"]).default("openrouter"),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-sonnet-4.5"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),

  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().optional(),
  EMAIL_SMTP_URL: z.string().optional(),
  GENERIC_WEBHOOK_URL: z.string().optional(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  // Fallback de desarrollo: si no hay Bearer token, autentica leyendo el rol
  // de x-role/x-user-id (ver auth/middleware.ts). Nunca en producción —
  // el check de abajo lo fuerza en false ahí sin importar este valor.
  ALLOW_DEV_ROLE_HEADER: z.coerce.boolean().default(true),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Configuración de entorno inválida:", parsed.error.flatten().fieldErrors);
    throw new Error("Variables de entorno inválidas o incompletas");
  }

  if (parsed.data.UNIFI_MODE === "live") {
    // UNIFI_OS_HOST/UNIFI_API_KEY ya no son solo del panel /infra de solo
    // lectura: nodos/WLANs/reboot (integrations/unifi/liveClient.ts) los usan
    // vía la Integration API. UNIFI_HOST/USERNAME/PASSWORD (API clásica) NO
    // son requeridos acá a propósito — solo los usa listAlerts, que nada
    // llama hoy, y no hay cuenta clásica creada en el UDM real (decisión
    // explícita, ver Atlas/Infraestructura Real.md).
    const missing = ["UNIFI_OS_HOST", "UNIFI_API_KEY"].filter(
      (key) => !parsed.data[key as keyof typeof parsed.data]
    );
    if (missing.length > 0) {
      throw new Error(
        `UNIFI_MODE=live requiere: ${missing.join(", ")}`
      );
    }
  }

  // Ninguna variable de entorno puede reactivar el stub de header en
  // producción, ni por error de config.
  if (parsed.data.NODE_ENV === "production") {
    parsed.data.ALLOW_DEV_ROLE_HEADER = false;
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
